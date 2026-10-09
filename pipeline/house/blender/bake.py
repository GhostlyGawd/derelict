"""Light for the house's baked surfaces (9.4.4, Blender and a tuner).

Run by pipeline/house/blender/run.js, never by hand and never in CI:

    blender -b --factory-startup --python bake.py -- <scene dir> <out dir> <samples>

It reads the house as pipeline/house/blender/export.js wrote it, lights it
with Cycles, and bakes each chart's light into a float map: diffuse, direct
and indirect, without the surface's own colour, so the pipeline can multiply
in the generated surface, its grime and its paint afterwards. Every map is
written raw (float32 RGBA, rows bottom first, as Blender keeps them), one
per light layer; run.js turns them into the committed PNGs.

Coordinates arrive as three.js has them, y up, and are turned to Blender's z up.
"""

import json
import os
import struct
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
scene_dir, out_dir, samples = argv[0], argv[1], int(argv[2])

with open(os.path.join(scene_dir, "scene.json")) as f:
    S = json.load(f)
with open(os.path.join(scene_dir, "scene.bin"), "rb") as f:
    raw = f.read()
F = struct.unpack("<%df" % (len(raw) // 4), raw)


def zup(x, y, z):
    return (x, -z, y)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = samples
scene.cycles.seed = 0
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 0
scene.cycles.transparent_max_bounces = 2
scene.render.threads_mode = "FIXED"
scene.render.threads = os.cpu_count() or 4

# Nothing comes in from a sky: the night is the windows' own glow.
world = bpy.data.worlds.new("none")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
scene.world = world


def diffuse(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfDiffuse")
    bsdf.inputs["Color"].default_value = (*rgb, 1)
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    return m


def emissive(name, rgb, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*rgb, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def mesh(name, verts, uvs=None):
    me = bpy.data.meshes.new(name)
    faces = [(i, i + 1, i + 2) for i in range(0, len(verts), 3)]
    me.from_pydata(verts, [], faces)
    if uvs is not None:
        layer = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv = uvs[me.loops[li].vertex_index]
    me.update()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


materials = []
glowing = []
for i, m in enumerate(S["materials"]):
    if m["emit"] > 0:
        materials.append(emissive(m["key"], m["albedo"], m["emit"]))
        glowing.append((m["layer"], materials[-1], m["emit"]))
    else:
        materials.append(diffuse(m["key"], m["albedo"]))

for i, p in enumerate(S["parts"]):
    o, n = p["offset"], p["count"]
    verts = [zup(F[o + 9 * t + 3 * k], F[o + 9 * t + 3 * k + 1], F[o + 9 * t + 3 * k + 2]) for t in range(n) for k in range(3)]
    ob = mesh("part%d" % i, verts)
    ob.data.materials.append(materials[p["material"]])

lamps = []
for L in S["lamps"]:
    light = bpy.data.lights.new(L["kind"], "SPOT" if L["kind"] == "spot" else "POINT")
    light.energy = L["power"]
    light.color = L["colour"]
    light.shadow_soft_size = L["radius"]
    if L["kind"] == "spot":
        light.spot_size = 2 * L["angle"]
        light.spot_blend = L["blend"]
        light.show_cone = False
    ob = bpy.data.objects.new(L["kind"], light)
    ob.location = zup(*L["pos"])
    scene.collection.objects.link(ob)  # a spot points down its own -z, which is down
    lamps.append((L["layer"], ob))

# The charts: each a mesh with its UVs, and a float image to bake into.
wall_like = {}
for m, mat in zip(S["materials"], materials):
    wall_like.setdefault(m["name"], m["albedo"])
targets = []
for c in S["charts"]:
    o, n = c["offset"], c["count"]
    verts, uvs = [], []
    for t in range(n * 3):
        b = o + 5 * t
        verts.append(zup(F[b], F[b + 1], F[b + 2]))
        uvs.append((F[b + 3], F[b + 4]))
    ob = mesh("chart:" + c["id"], verts, uvs)
    # A bake looks out along the face's normal: face every triangle into the room.
    want = zup(*c["normal"])
    for poly in ob.data.polygons:
        if sum(a * b for a, b in zip(poly.normal, want)) < 0:
            poly.flip()
    ob.data.update()
    mat = diffuse("chart:" + c["id"], wall_like.get(c["material"], (0.3, 0.3, 0.3)))
    img = bpy.data.images.new(c["id"], width=c["w"], height=c["h"], alpha=True, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    mat.node_tree.nodes.active = node
    ob.data.materials.append(mat)
    targets.append((c, ob, img))

bake = scene.render.bake
bake.use_pass_direct = True
bake.use_pass_indirect = True
bake.use_pass_color = False
bake.margin = 6
bake.margin_type = "EXTEND"

os.makedirs(out_dir, exist_ok=True)
# One bake per light layer, everything else switched off, so the pipeline can
# weigh the lamp's cone, its glow and the night against each other afterwards
# without baking again: light adds.
layers = sorted({l for l, _ in lamps} | {l for l, _, _ in glowing})
for layer in layers:
    for l, ob in lamps:
        ob.hide_render = l != layer
    for l, mat, emit in glowing:
        mat.node_tree.nodes["Emission"].inputs["Strength"].default_value = emit if l == layer else 0.0
    for c, ob, img in targets:
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=6)
        px = img.pixels[:]
        with open(os.path.join(out_dir, "%s.%s.f32" % (c["id"], layer)), "wb") as f:
            f.write(struct.pack("<%df" % len(px), *px))
        print("baked", c["id"], layer, c["w"], c["h"], flush=True)
