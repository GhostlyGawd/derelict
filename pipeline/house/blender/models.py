"""The house's pieces, modelled by Blender (9.3, the owner's look at the
modelled hall: bespoke models by two free tools at build time).

Run by pipeline/house/blender/models.js, never by hand and never in CI:

    blender -b --factory-startup --python models.py -- <job.json> <out dir>

Each piece is modelled the way a modeller would: real bevels on every arris,
turned and swept profiles, planks with their joints, and wear pushed into the
surface, not boxes with a texture. Every piece is built in its own frame at
real size, Blender's z up with its front toward -y (three.js's +z), and
written as one GLB. Its texture coordinates are laid at the size each texture
was made for (the job's `metres`, from the house's manifest), so the
texture-scale check holds them like any other surface.

Material slots are named for the house's materials (wood, door, enamel,
shade, brass, iron, glaze, cloth, night, paper, wicker); the game puts its own
materials on them by name.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

argv = sys.argv[sys.argv.index("--") + 1:]
with open(argv[0]) as f:
    JOB = json.load(f)
OUT = argv[1]
METRES = JOB["metres"]

# ---------------------------------------------------------------- helpers


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


MATS = {}


def material(name):
    if name not in MATS:
        MATS[name] = bpy.data.materials.new(name)
    return MATS[name]


def new_object(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if isinstance(mat, str):
        mat = [mat]
    for m in mat:
        ob.data.materials.append(material(m))
    return ob


def apply(ob, *mods):
    """Adds modifiers and applies them, in order."""
    bpy.context.view_layer.objects.active = ob
    for kind, opts in mods:
        m = ob.modifiers.new(kind.lower(), kind)
        for k, v in opts.items():
            setattr(m, k, v)
        bpy.ops.object.modifier_apply(modifier=m.name)
    return ob


def bevel(ob, width=0.006, segments=2, limit="ANGLE"):
    return apply(ob, ("BEVEL", {"width": width, "segments": segments, "limit_method": limit, "angle_limit": math.radians(40), "harden_normals": False}))


def block(name, x0, x1, y0, y1, z0, z1, mat="wood", r=0.006, segments=2):
    """A board from (x0, y0, z0) to (x1, y1, z1), its arrises rounded by r."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0)))
    ob = new_object(name, bm, mat)
    r = min(r, (x1 - x0) / 2.2, (y1 - y0) / 2.2, (z1 - z0) / 2.2)
    if r > 0.0008:
        bevel(ob, r, segments)
    return ob


def lathe(name, profile, mat, segments=32, cap=True):
    """A turned shape: (radius, z) points from the bottom up, about z."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap:
        for ring, flip in ((rings[0], True), (rings[-1], False)):
            if profile[rings.index(ring)][0] > 1e-4:
                f = bm.faces.new(ring[::-1] if flip else ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_object(name, bm, mat)
    ob["smooth"] = True
    return ob


def orient(ob, away_from, outward=True):
    """Turns every face of an open shell to face away from a point (or toward
    it): a lathed shell has no inside for Blender to find, so it is told."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    p = Vector(away_from)
    flip = [f for f in bm.faces if (f.normal.dot(f.calc_center_median() - p) > 0) != outward]
    bmesh.ops.reverse_faces(bm, faces=flip)
    bm.to_mesh(me)
    bm.free()
    return ob


def sweep(name, profile, path, mat, closed=False):
    """A profile, (across, up) points, swept along a path of points: a rail or a moulding."""
    bm = bmesh.new()
    rings = []
    n = len(path)
    for i, p in enumerate(path):
        p = Vector(p)
        t = (Vector(path[min(i + 1, n - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
        up = Vector((0, 0, 1)) if abs(t.z) < 0.95 else Vector((0, 1, 0))
        side = t.cross(up).normalized()
        up = side.cross(t).normalized()
        rings.append([bm.verts.new(p + side * a + up * b) for a, b in profile])
    m = len(profile)
    for a, b in zip(rings, rings[1:]):
        for k in range(m if closed else m - 1):
            k2 = (k + 1) % m
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    if closed:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_object(name, bm, mat)


def wear(ob, amount=0.002, scale=0.05, seed=0):
    """Pushes the surface in and out a little, as handling and age do: the
    surface must be fine enough to carry it, so it is subdivided first."""
    me = ob.data
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    for v in me.vertices:
        n = noise.noise((v.co / scale) + off)
        v.co += v.normal * n * amount
    return ob


def join(name, obs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob


def uv_islands(ob):
    """Soft, curved pieces (cloth, the bag): unwrapped into islands by
    Blender, every island at the same density, then scaled so one unit of
    texture is the metres its material stands for."""
    me = ob.data
    name = me.materials[0].name if me.materials else "wood"
    mu, mv = METRES.get(name, [1, 1])
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    a3 = sum(f.calc_area() for f in bm.faces)
    a2 = 0.0
    for f in bm.faces:
        pts = [l[uv].uv for l in f.loops]
        for i in range(1, len(pts) - 1):
            a2 += abs((pts[i] - pts[0]).cross(pts[i + 1] - pts[0])) / 2
    k = math.sqrt(a3 / max(a2, 1e-12))
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = (l[uv].uv.x * k / mu, l[uv].uv.y * k / mv)
    bm.to_mesh(me)
    bm.free()


def uv_real(ob):
    """Texture coordinates at real size: each face projected along the axis it
    faces most, divided by the metres one repeat of its material stands for.
    Turned pieces are unrolled round their axis instead (`turned` in their
    object's custom properties)."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    turned = ob.get("turned", False)
    for f in bm.faces:
        name = me.materials[f.material_index].name if me.materials else "wood"
        mu, mv = METRES.get(name, [1, 1])
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        # A face square to no axis (a chamfer, a bevel) is laid out in its
        # own plane, so it shows its texture at its size, not stretched.
        up = Vector((0, 0, 1)) if az < 0.9 else Vector((0, 1, 0))
        tu = up.cross(n).normalized()
        tv = n.cross(tu).normalized()
        square = max(ax, ay, az) > 0.999
        for l in f.loops:
            co = l.vert.co
            if not square and not turned:
                l[uv].uv = (co.dot(tu) / mu, co.dot(tv) / mv)
                continue
            if turned and az < 0.9:
                a = math.atan2(co.y, co.x)
                r = max(0.02, math.hypot(co.x, co.y))
                # Continuous across a face that straddles the seam.
                ref = math.atan2(f.calc_center_median().y, f.calc_center_median().x)
                if a - ref > math.pi:
                    a -= 2 * math.pi
                if ref - a > math.pi:
                    a += 2 * math.pi
                l[uv].uv = (a * r / mu, co.z / mv)
            elif az >= ax and az >= ay:
                l[uv].uv = (co.x / mu, co.y / mv)
            elif ax >= ay:
                l[uv].uv = (co.y / mu, co.z / mv)
            else:
                l[uv].uv = (co.x / mu, co.z / mv)
    bm.to_mesh(me)
    bm.free()


def export(name, obs):
    for o in obs:
        if o.get("islands"):
            uv_islands(o)
        else:
            uv_real(o)
        if o.get("smooth"):
            # Round things shade round: smooth across faces meeting at under 50°.
            for p in o.data.polygons:
                p.use_smooth = True
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
    bpy.ops.object.select_all(action="DESELECT")
    for o in obs:
        o.select_set(True)
    path = os.path.join(OUT, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=True,
        export_materials="EXPORT",
        export_extras=True,
    )
    print("modelled", name, sum(len(o.data.polygons) for o in obs), "faces", flush=True)


# ---------------------------------------------------------------- doors


def plank_panel(name, x0, x1, z0, z1, t, mat, planks=3, seed=0):
    """A panel filled with upright planks, as the painting's doors are: each
    plank a board with its edges taken off, so a dark joint shows between."""
    obs = []
    w = (x1 - x0) / planks
    for k in range(planks):
        a = x0 + k * w + 0.0015
        b = x0 + (k + 1) * w - 0.0015
        p = block(f"{name}-{k}", a, b, -t / 2, t / 2, z0, z1, mat, r=0.006, segments=2)
        obs.append(p)
    return obs


def bolection(name, x0, x1, z0, z1, y, side, mat):
    """A moulding round a panel, proud of the frame: a rounded bead with a step."""
    prof = [(0.0, 0.0), (0.0, 0.006), (0.006, 0.014), (0.014, 0.016), (0.022, 0.012), (0.026, 0.0)]
    # Across is in from the frame's edge toward the panel; up is out of the face.
    pts = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    obs = []
    for i in range(4):
        (ax, az), (bx, bz) = pts[i], pts[(i + 1) % 4]
        d = Vector((bx - ax, 0, bz - az)).normalized()
        inward = Vector((-d.z, 0, d.x)) * -1
        path = [(ax, y, az), (bx, y, bz)]
        prof_world = [(-(a), side * b) for a, b in prof]
        ob = sweep(f"{name}-{i}", [(0, 0)] + prof_world[1:], path, mat)
        obs.append(ob)
    return obs


def door_leaf(name, w, h, t=0.048, glazed=False, panes=(2, 2), seed=0):
    """A door leaf, centred on x, standing from z = 0 to h, its faces at
    y = ±t/2. Interior doors: stiles and rails round two panels filled with
    upright planks, in a moulding, as the painting's parlour door. The front
    door: upright boards below a lock rail and two lights of glass above."""
    obs = []
    st = 0.12
    top = 0.12
    bottom = 0.22
    mid = 0.17
    x0, x1 = -w / 2, w / 2
    obs.append(block(f"{name}-stile-l", x0, x0 + st, -t / 2, t / 2, 0, h, "door", r=0.007))
    obs.append(block(f"{name}-stile-r", x1 - st, x1, -t / 2, t / 2, 0, h, "door", r=0.007))
    obs.append(block(f"{name}-rail-b", x0 + st, x1 - st, -t / 2, t / 2, 0, bottom, "door", r=0.007))
    obs.append(block(f"{name}-rail-t", x0 + st, x1 - st, -t / 2, t / 2, h - top, h, "door", r=0.007))
    free = h - top - bottom - mid
    lower = free * (0.52 if glazed else 0.44)
    zm = bottom + lower
    obs.append(block(f"{name}-rail-m", x0 + st, x1 - st, -t / 2, t / 2, zm, zm + mid, "door", r=0.007))
    px0, px1 = x0 + st, x1 - st
    planks = max(3, round((px1 - px0) / 0.12))
    # Lower panel: planks, set back in the frame.
    obs += plank_panel(f"{name}-lo", px0, px1, bottom, zm, t * 0.55, "door", planks if not glazed else planks + 1, seed)
    if glazed:
        # Two lights, a mullion between, each crossed by a glazing bar; the
        # night behind (both faces), held by a small moulding.
        zg0, zg1 = zm + mid, h - top
        for s in (-1, 1):
            pane = block(f"{name}-glass-{s}", px0, px1, s * 0.004 - 0.0005, s * 0.004 + 0.0005, zg0, zg1, "night", r=0)
            obs.append(pane)
        cols, rows = panes
        for c in range(1, cols):
            bx = px0 + (px1 - px0) * c / cols
            obs.append(block(f"{name}-mull-{c}", bx - 0.022, bx + 0.022, -t / 2, t / 2, zg0, zg1, "door", r=0.006))
        for r in range(1, rows):
            bz = zg0 + (zg1 - zg0) * r / rows
            obs.append(block(f"{name}-bar-{r}", px0, px1, -0.012, 0.012, bz - 0.012, bz + 0.012, "door", r=0.004))
        for s in (-1, 1):
            obs += bolection(f"{name}-gb{s}", px0, px1, zg0, zg1, s * t / 2, s, "door")
        # The lock: an iron plate on the rail with a keyhole, and a knob.
        lx = x1 - st / 2 if True else 0
        obs.append(block(f"{name}-lock", lx - 0.04, lx + 0.04, -t / 2 - 0.006, -t / 2, zm + 0.02, zm + 0.2, "iron", r=0.003))
    else:
        obs += plank_panel(f"{name}-hi", px0, px1, zm + mid, h - top, t * 0.55, "door", planks, seed + 1)
    for s in (-1, 1):
        obs += bolection(f"{name}-lb{s}", px0, px1, bottom, zm, s * t / 2, s, "door")
        if not glazed:
            obs += bolection(f"{name}-hb{s}", px0, px1, zm + mid, h - top, s * t / 2, s, "door")
    for o in obs:
        wear(o, 0.0012, 0.03, seed)
    return obs


# ---------------------------------------------------------------- furniture


def cabinet(name, L, D, H, seed=0):
    """The low cabinet in the painting's left corner, its back to the wall at
    y = +D/2 and its front toward -y: a plinth, a carcass with a moulded top
    that overhangs it, a row of drawers, and two panelled doors."""
    obs = []
    x0, x1 = -L / 2, L / 2
    y0, y1 = -D / 2, D / 2
    obs.append(block("plinth", x0 + 0.02, x1 - 0.02, y0 + 0.03, y1, 0, 0.08, "wood", r=0.004))
    obs.append(block("carcass", x0, x1, y0 + 0.02, y1, 0.08, H - 0.035, "wood", r=0.006))
    # The top: a board with a rounded front, overhanging.
    obs.append(block("top", x0 - 0.025, x1 + 0.025, y0 - 0.03, y1, H - 0.035, H, "wood", r=0.012, segments=3))
    # The front: a frame of stiles and rails, drawers above, doors below.
    fy = y0 + 0.02
    n = 2
    dw = (L - 0.08) / n
    for k in range(n):
        a = x0 + 0.04 + k * dw
        b = a + dw
        # A drawer front with a rounded edge, a little proud, and a pull.
        obs.append(block(f"drawer-{k}", a + 0.01, b - 0.01, fy - 0.022, fy, H - 0.2, H - 0.06, "door", r=0.006))
        pull = lathe(f"pull-{k}", [(0.0, 0), (0.016, 0.0), (0.018, 0.006), (0.01, 0.014), (0.02, 0.022), (0.0, 0.026)], "brass", 12)
        pull.rotation_euler = (math.pi / 2, 0, 0)
        pull.location = ((a + b) / 2, fy - 0.022, H - 0.13)
        obs.append(pull)
        # A panelled door: a frame round a fielded panel.
        z0, z1 = 0.12, H - 0.24
        obs.append(block(f"door-{k}", a + 0.01, b - 0.01, fy - 0.022, fy, z0, z1, "door", r=0.005))
        obs.append(block(f"field-{k}", a + 0.07, b - 0.07, fy - 0.034, fy - 0.022, z0 + 0.07, z1 - 0.07, "door", r=0.008, segments=3))
        knob = lathe(f"knob-{k}", [(0.0, 0), (0.012, 0.0), (0.014, 0.008), (0.009, 0.014), (0.016, 0.022), (0.0, 0.028)], "brass", 12)
        knob.rotation_euler = (math.pi / 2, 0, 0)
        knob.location = (b - 0.05 if k == 0 else a + 0.05, fy - 0.022, (z0 + z1) / 2 + 0.05)
        obs.append(knob)
    for o in obs:
        wear(o, 0.0015, 0.04, seed)
    return obs


def chair(name, seed=0):
    """A small hard chair, its back toward +y: square legs tapering to the
    floor, stretchers, a board seat, and a back of two posts and a rail."""
    obs = []
    s = 0.2
    seat = 0.45
    for dx in (-1, 1):
        for dy in (-1, 1):
            x = dx * (s - 0.025)
            y = dy * (s - 0.025)
            top = 0.92 if dy > 0 else seat
            leg = block(f"leg{dx}{dy}", x - 0.018, x + 0.018, y - 0.018, y + 0.018, 0, top, "wood", r=0.004)
            # Taper toward the foot.
            for v in leg.data.vertices:
                if v.co.z < 0.05:
                    v.co.x = x + (v.co.x - x) * 0.75
                    v.co.y = y + (v.co.y - y) * 0.75
            obs.append(leg)
    obs.append(block("seat", -s, s, -s, s, seat - 0.03, seat, "wood", r=0.008, segments=3))
    for y in (-s + 0.03, s - 0.03):
        obs.append(block(f"str-x{y}", -s + 0.03, s - 0.03, y - 0.008, y + 0.008, 0.15, 0.175, "wood", r=0.003))
    for x in (-s + 0.03, s - 0.03):
        obs.append(block(f"str-y{x}", x - 0.008, x + 0.008, -s + 0.03, s - 0.03, 0.2, 0.225, "wood", r=0.003))
    obs.append(block("rail-top", -s + 0.01, s - 0.01, s - 0.04, s - 0.012, 0.8, 0.9, "wood", r=0.01, segments=3))
    obs.append(block("rail-mid", -s + 0.01, s - 0.01, s - 0.036, s - 0.016, 0.62, 0.66, "wood", r=0.006))
    for o in obs:
        wear(o, 0.001, 0.03, seed)
    return obs


def chest_with_cloth(name, L=0.82, D=0.48, H=0.5, seed=0):
    """A chest under a white cloth: the chest is boards on a plinth with a
    lid; the cloth is dropped on it by Blender's cloth simulation, so it
    falls in the folds a cloth would."""
    obs = []
    x0, x1, y0, y1 = -L / 2, L / 2, -D / 2, D / 2
    obs.append(block("base", x0, x1, y0, y1, 0, 0.06, "wood", r=0.005))
    obs.append(block("body", x0 + 0.01, x1 - 0.01, y0 + 0.01, y1 - 0.01, 0.06, H - 0.05, "wood", r=0.006))
    obs.append(block("lid", x0 - 0.01, x1 + 0.01, y0 - 0.01, y1 + 0.01, H - 0.05, H, "wood", r=0.01, segments=3))
    for x in (x0 + 0.12, x1 - 0.12):
        obs.append(block(f"strap{x}", x - 0.025, x + 0.025, y0 - 0.006, y0 + 0.01, 0.04, H - 0.04, "iron", r=0.003))
    collider = [o for o in obs]
    # The cloth: a sheet a little wider than the lid, falling over the front.
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=48, y_subdivisions=40, size=1)
    cloth = bpy.context.active_object
    cloth.name = "cloth"
    cloth.scale = (L * 0.9, D + 0.36, 1)
    cloth.location = (-0.05, -0.06, H + 0.02)
    cloth.rotation_euler = (0, 0, math.radians(4))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    cloth.data.materials.append(material("cloth"))
    for o in collider:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_add(type="COLLISION")
        if os.environ.get("CLOTH_DEBUG"):
            print(o.name, [m.type for m in o.modifiers], len(o.data.vertices), flush=True)
        o.collision.thickness_outer = 0.006
        # Cloth on a wooden lid does not slide off: it holds.
        o.collision.cloth_friction = 80
        o.collision.use_culling = False
    # A floor for the hem to settle on.
    bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, 0))
    floor = bpy.context.active_object
    bpy.ops.object.modifier_add(type="COLLISION")
    m = cloth.modifiers.new("cloth", "CLOTH")
    m.settings.quality = 8
    m.settings.mass = 0.25
    m.settings.tension_stiffness = 12
    m.settings.bending_stiffness = 0.6
    m.collision_settings.distance_min = 0.004
    m.collision_settings.friction = 40
    m.collision_settings.use_self_collision = False
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 60
    for f in range(1, 61):
        scene.frame_set(f)
        if os.environ.get("CLOTH_DEBUG") and f % 10 == 0:
            ev = cloth.evaluated_get(bpy.context.evaluated_depsgraph_get())
            zs = [v.co.z for v in ev.data.vertices]
            xs = [v.co.x for v in ev.data.vertices]
            print("frame", f, "z", min(zs), max(zs), "x", min(xs), max(xs), flush=True)
    bpy.context.view_layer.objects.active = cloth
    bpy.ops.object.modifier_apply(modifier=m.name)
    apply(cloth, ("SOLIDIFY", {"thickness": 0.004}))
    cloth["smooth"] = True
    cloth["islands"] = True
    bpy.data.objects.remove(floor)
    for o in collider:
        o.modifiers.clear()
    for o in obs:
        wear(o, 0.0012, 0.04, seed)
    return obs + [cloth]


def vase(name, s=1.0, seed=0):
    """A green glazed vase, turned: a foot, a full belly and a narrow neck
    with a lip, slightly out of true, as a hand-thrown one is."""
    prof = [(0.0, 0.0), (0.05, 0.0), (0.056, 0.012), (0.075, 0.05), (0.098, 0.11), (0.103, 0.15), (0.094, 0.2), (0.064, 0.25), (0.04, 0.285), (0.036, 0.31), (0.046, 0.33), (0.05, 0.338), (0.042, 0.342), (0.032, 0.33)]
    ob = lathe(name, [(r * s, z * s) for r, z in prof], "glaze", 40, cap=True)
    for v in ob.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        k = 1 + 0.025 * math.sin(3 * a + 1.3) * math.sin(v.co.z * 20)
        v.co.x *= k
        v.co.y *= k
    ob["turned"] = True
    return [ob]


def clock(name, R=0.1, seed=0):
    """A round drum clock on two feet, as the painting's cabinet carries: a
    brass bezel round a pale face, a drum case behind, and a ring on top."""
    obs = []
    drum = lathe("drum", [(0.0, -0.04), (R, -0.04), (R + 0.006, -0.03), (R + 0.006, 0.03), (R, 0.04), (0.0, 0.04)], "wood", 40)
    drum.rotation_euler = (math.pi / 2, 0, 0)
    drum.location = (0, 0, R + 0.03)
    obs.append(drum)
    bez = lathe("bezel", [(R - 0.016, 0.0), (R + 0.004, 0.0), (R + 0.006, 0.006), (R - 0.004, 0.014), (R - 0.016, 0.01)], "brass", 40, cap=False)
    bez.rotation_euler = (math.pi / 2, 0, 0)
    bez.location = (0, -0.04, R + 0.03)
    obs.append(bez)
    face = lathe("face", [(0.0, 0.0), (R - 0.015, 0.0)], "paper", 40, cap=False)
    face.rotation_euler = (math.pi / 2, 0, 0)
    face.location = (0, -0.041, R + 0.03)
    obs.append(face)
    for s in (-1, 1):
        foot = lathe(f"foot{s}", [(0.0, 0.0), (0.014, 0.0), (0.01, 0.03), (0.0, 0.035)], "brass", 10)
        foot.location = (s * R * 0.6, 0, 0)
        obs.append(foot)
    ring = bpy.data.objects.new("ring", None)
    obs2 = []
    torus = bmesh.new()
    bmesh.ops.create_circle(torus, segments=16, radius=0.02)
    # A small ring on top, as a handle.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.022, minor_radius=0.004, location=(0, 0, 2 * R + 0.06), rotation=(math.pi / 2, 0, 0))
    t = bpy.context.active_object
    t.data.materials.append(material("brass"))
    obs.append(t)
    return obs


def lamp(name, seed=0):
    """The painting's pendant: a wide, shallow enamel shade, white inside
    and out, with a rolled rim, a gallery where the cord comes in, and the
    bulb showing under it."""
    prof = [(0.03, 0.12), (0.045, 0.11), (0.07, 0.095), (0.12, 0.065), (0.18, 0.03), (0.22, 0.005), (0.245, -0.012), (0.258, -0.022)]
    outer = lathe("outer", prof, "enamel", 48, cap=False)
    outer["turned"] = True
    inner = lathe("inner", [(r * 0.985, z - 0.004) for r, z in prof], "shade", 48, cap=False)
    inner["turned"] = True
    # The enamel faces up and out, the lit white faces down into the room.
    orient(outer, (0, 0, -0.3), outward=True)
    orient(inner, (0, 0, -0.3), outward=False)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.258, minor_radius=0.006, location=(0, 0, -0.022))
    rim = bpy.context.active_object
    rim.data.materials.append(material("enamel"))
    gallery = lathe("gallery", [(0.0, 0.2), (0.018, 0.2), (0.022, 0.17), (0.034, 0.14), (0.034, 0.11), (0.0, 0.11)], "brass", 20)
    bulb = lathe("bulb", [(0.0, -0.06), (0.02, -0.055), (0.032, -0.035), (0.03, -0.01), (0.016, 0.01), (0.014, 0.04), (0.0, 0.04)], "shade", 20)
    return [outer, inner, rim, gallery, bulb]


def joist(name, L, W=0.16, D=0.2, seed=0):
    """A heavy ceiling joist along x, its top at z = 0: hewn, with its lower
    arrises chamfered and adze marks along its faces."""
    ob = block(name, -L / 2, L / 2, -W / 2, W / 2, -D, 0, "wood", r=0.018, segments=1)
    # Enough faces along it for the adze marks to sit in.
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=6)
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in ob.data.vertices:
        n = noise.noise(Vector((v.co.x * 4 + seed, v.co.y * 30, v.co.z * 30)))
        v.co += v.normal * n * 0.006
    return [ob]


def newel(name, h, w=0.13, seed=0):
    """The newel post at the foot of the stairs, as the painting's: a heavy
    square timber with its arrises chamfered, stopped short of the floor and
    the cap, a moulded cap overhanging it, and a shallow pyramid on top."""
    obs = []
    obs.append(block("base", -w / 2 - 0.01, w / 2 + 0.01, -w / 2 - 0.01, w / 2 + 0.01, 0, 0.12, "wood", r=0.006))
    shaft = block("shaft", -w / 2, w / 2, -w / 2, w / 2, 0.12, h - 0.1, "wood", r=0.016, segments=1)
    obs.append(shaft)
    obs.append(block("collar", -w / 2 - 0.008, w / 2 + 0.008, -w / 2 - 0.008, w / 2 + 0.008, h - 0.1, h - 0.07, "wood", r=0.005))
    c = w / 2 + 0.025
    obs.append(block("cap", -c, c, -c, c, h - 0.07, h - 0.02, "wood", r=0.012, segments=3))
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=c * 1.25, radius2=0.004, depth=0.07)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 4, 3, "Z"))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h + 0.015))
    obs.append(new_object("top", bm, "wood"))
    for o in obs:
        wear(o, 0.0012, 0.03, seed)
    return obs


def baluster(name, h, w=0.04, seed=0):
    """A square baluster with its arrises chamfered, and a short square block
    at each end where it is housed in the string and the rail."""
    obs = [
        block("foot", -w / 2 - 0.004, w / 2 + 0.004, -w / 2 - 0.004, w / 2 + 0.004, 0, 0.06, "wood", r=0.004),
        block("shaft", -w / 2, w / 2, -w / 2, w / 2, 0.06, h - 0.06, "wood", r=0.008, segments=1),
        block("head", -w / 2 - 0.004, w / 2 + 0.004, -w / 2 - 0.004, w / 2 + 0.004, h - 0.06, h, "wood", r=0.004),
    ]
    return obs


def bag(name, tall=1.0, seed=0):
    """The woven bag on the back wall: a soft sack of wicker, a flap over its
    mouth, two straps crossed over its front, and a loop it hangs by."""
    obs = []
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=1)
    body = bpy.context.active_object
    body.name = "body"
    for v in body.data.vertices:
        x, y, z = v.co
        # A sack: flat at the back, fuller at the bottom, square-shouldered.
        y = y * (0.45 if y > 0 else 0.6)
        x = x * (1 - 0.15 * z)
        z = z * (1.05 if z < 0 else 0.95)
        v.co = Vector((x * 0.21, y * 0.16, z * 0.3 * tall))
    body.data.materials.append(material("wicker"))
    body["smooth"] = True
    body["islands"] = True
    obs.append(body)
    # The flap: a curved sheet over the top half.
    flap = sweep("flap", [(-0.2, 0.0), (0.2, 0.0)], [(0, -0.06 - 0.03 * math.sin(t / 8 * math.pi), (0.29 - t * 0.032) * tall) for t in range(9)], "wicker")
    apply(flap, ("SOLIDIFY", {"thickness": 0.012}))
    obs.append(flap)
    # Straps crossed over the front, from the shoulders to the bottom corners.
    strap = [(-0.012, -0.003), (0.012, -0.003), (0.012, 0.003), (-0.012, 0.003)]
    for s in (-1, 1):
        path = []
        for i in range(13):
            t = i / 12
            x = s * (0.16 - 0.32 * t)
            z = (0.24 - 0.48 * t) * tall
            y = -0.115 - 0.03 * math.sin(t * math.pi)
            path.append((x, y, z))
        obs.append(sweep(f"strap{s}", strap, path, "leather", closed=True))
    # The loop it hangs by.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.008, location=(0, 0.02, 0.3 * tall + 0.04), rotation=(math.pi / 2, 0, 0))
    loop = bpy.context.active_object
    loop.data.materials.append(material("leather"))
    obs.append(loop)
    for o in obs:
        wear(o, 0.004, 0.05, seed)
    return obs


def fixture(name, s=1.0, seed=0):
    """A bell push on a round wooden pattress, as by a door."""
    base = lathe("pattress", [(r * s, z * s) for r, z in [(0.0, 0.0), (0.045, 0.0), (0.045, 0.012), (0.04, 0.02), (0.0, 0.02)]], "wood", 24)
    push = lathe("push", [(r * s, z * s) for r, z in [(0.0, 0.02), (0.022, 0.02), (0.024, 0.03), (0.016, 0.04), (0.008, 0.044), (0.0, 0.044)]], "brass", 20)
    for o in (base, push):
        o.rotation_euler = (math.pi / 2, 0, 0)
    return [base, push]


def rag(name, seed=0):
    """Something small on the floor: a rag dropped and left, in its creases."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=16, y_subdivisions=16, size=0.22)
    ob = bpy.context.active_object
    for v in ob.data.vertices:
        x, y = v.co.x, v.co.y
        r = math.hypot(x, y)
        h = max(0, 0.05 - r * 0.35) + 0.012 * noise.noise(Vector((x * 30 + seed, y * 30, 0.5)))
        # Gathered toward the middle.
        k = 0.6 + 0.4 * (1 - min(1, r / 0.16))
        v.co = Vector((x * k, y * k, max(0.002, h)))
    ob.data.materials.append(material("cloth"))
    ob["smooth"] = True
    return [ob]


# ---------------------------------------------------------------- the job

PIECES = {
    "cabinet": lambda p: cabinet("cabinet", *p["size"]),
    "chair": lambda p: chair("chair"),
    "chest": lambda p: chest_with_cloth("chest"),
    "vase": lambda p: vase("vase", p.get("scale", 1.0)),
    "clock": lambda p: clock("clock", p.get("radius", 0.1)),
    "lamp": lambda p: lamp("lamp"),
    "joist": lambda p: joist(p["id"], p["length"]),
    "bag": lambda p: bag("bag", p.get("tall", 1.0)),
    "newel": lambda p: newel("newel", p["height"]),
    "baluster": lambda p: baluster("baluster", p["height"]),
    "fixture": lambda p: fixture("fixture", p.get("scale", 1.0)),
    "rag": lambda p: rag("rag"),
}

for piece in JOB["pieces"]:
    reset()
    MATS.clear()
    kind = piece["kind"]
    if kind == "door":
        obs = door_leaf(piece["id"], piece["w"], piece["h"], glazed=piece.get("glazed", False), panes=tuple(piece.get("panes", (2, 2))), seed=piece.get("seed", 0))
    else:
        obs = PIECES[kind](piece)
    export(piece["id"], obs)
