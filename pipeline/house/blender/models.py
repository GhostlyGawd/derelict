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


def apply_transform(ob):
    """Bakes an object's placement into its vertices, so its texture
    coordinates, laid from vertex positions, are laid where it stands."""
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


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
    # How far along the profile each ring is: a turned piece's texture runs
    # up its surface by this, not by height, or a flat rose shows its grain
    # four times too big.
    arc = bm.verts.layers.float.new("arc")
    rings = []
    s = 0.0
    for k, (r, z) in enumerate(profile):
        if k:
            s += math.hypot(r - profile[k - 1][0], z - profile[k - 1][1])
        ring = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            v = bm.verts.new((r * math.cos(a), r * math.sin(a), z))
            v[arc] = s
            ring.append(v)
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


# Slots that wear no texture, or one with no size (a notice, a painting, the
# night): only these may be missing from the job's metres.
UNSIZED = {"brass", "black", "mirror", "shade", "lampshade", "glaze", "night", "paper", "picture"}


def metres_of(name):
    """The metres one repeat of a slot's texture stands for. A textured slot
    with no size fails the model: the fireplace's breast wore the wall's
    plaster at a metre a repeat, not 2.8, because the job named it `plaster`."""
    base = name.split("#")[0]
    if base in METRES:
        return METRES[base]
    if base in UNSIZED:
        return [1, 1]
    raise RuntimeError(f"no size for the texture of slot {name!r}: add it to the job's metres")


def uv_islands(ob):
    """Soft, curved pieces (cloth, the bag): unwrapped into islands by
    Blender, every island at the same density, then scaled so one unit of
    texture is the metres its material stands for."""
    me = ob.data
    name = me.materials[0].name if me.materials else "wood"
    mu, mv = metres_of(name)
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
    arc = bm.verts.layers.float.get("arc")
    for f in bm.faces:
        name = me.materials[f.material_index].name if me.materials else "wood"
        # A slot in its own paint (`door#d8ccb8`) wears its material's texture at its size.
        mu, mv = metres_of(name)
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
            # A turned piece is unrolled round its axis where its surface
            # stands near upright. Where it slopes (a flared foot, a shade)
            # unrolling shears it, so it is laid in its own plane instead.
            steep = turned and az < 0.3
            if not square and not steep:
                l[uv].uv = (co.dot(tu) / mu, co.dot(tv) / mv)
                continue
            if steep:
                # Round the axis by the face's own mean radius: by each
                # vertex's own, a cone's face is sheared, its rings set off
                # sideways by the angle times the difference in radius.
                c = f.calc_center_median()
                ref = math.atan2(c.y, c.x)
                rf = sum(math.hypot(q.vert.co.x, q.vert.co.y) for q in f.loops) / len(f.loops)
                a = math.atan2(co.y, co.x) if math.hypot(co.x, co.y) > 1e-6 else ref
                # Continuous across a face that straddles the seam.
                if a - ref > math.pi:
                    a -= 2 * math.pi
                if ref - a > math.pi:
                    a += 2 * math.pi
                l[uv].uv = (a * rf / mu, (l.vert[arc] if arc is not None else co.z) / mv)
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
        if o.get("uvdone"):
            pass
        elif o.get("islands"):
            uv_islands(o)
        else:
            uv_real(o)
        if o.get("smooth"):
            # Round things shade round: smooth across faces meeting at under 50°.
            for p in o.data.polygons:
                p.use_smooth = True
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
    if os.environ.get("MODEL_DEBUG"):
        bpy.context.view_layer.update()
        for o in obs:
            zs = [(o.matrix_world @ v.co).z for v in o.data.vertices]
            print("  part", o.name, round(min(zs), 3), round(max(zs), 3), flush=True)
    # Placements baked into the vertices, now their texture is laid: a part
    # left turned in its node is measured by the box round its turned box,
    # and a leg on a slant then reads as reaching under the floor.
    for o in obs:
        apply_transform(o)
        # One texture layer, named alike on every part: a join keeps layers
        # by name, and a part whose layer was named otherwise (a primitive's
        # beside one built by hand) came out with every texel at one point.
        uvs = o.data.uv_layers
        while len(uvs) > 1:
            uvs.remove(uvs[-1])
        if len(uvs):
            uvs[0].name = "UVMap"
    # One mesh to a material: a bookcase is one draw of its wood and one of
    # each colour of its spines, not a draw for every book.
    groups = {}
    for o in obs:
        groups.setdefault(tuple(m.name for m in o.data.materials), []).append(o)
    obs = []
    for key, group in groups.items():
        if len(group) > 1:
            group = [join(group[0].name, group)]
        obs += group
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
    # Deep enough to hold a shadow: the first, half this size, read flat on the sheet.
    prof = [(a * 1.5, b * 1.5) for a, b in [(0.0, 0.0), (0.0, 0.006), (0.006, 0.014), (0.014, 0.016), (0.022, 0.012), (0.026, 0.0)]]
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


def door_leaf(name, w, h, t=0.048, glazed=False, panes=(2, 2), seed=0, knob=1):
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
    obs += plank_panel(f"{name}-lo", px0, px1, bottom, zm, t * 0.35, "door", planks if not glazed else planks + 1, seed)
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
        lx = knob * (w / 2 - st / 2)
        obs.append(block(f"{name}-lock", lx - 0.04, lx + 0.04, -t / 2 - 0.006, -t / 2, zm + 0.02, zm + 0.2, "iron", r=0.003))
    else:
        obs += plank_panel(f"{name}-hi", px0, px1, zm + mid, h - top, t * 0.35, "door", planks, seed + 1)
    for s in (-1, 1):
        obs += bolection(f"{name}-lb{s}", px0, px1, bottom, zm, s * t / 2, s, "door")
        if not glazed:
            obs += bolection(f"{name}-hb{s}", px0, px1, zm + mid, h - top, s * t / 2, s, "door")
    # A brass knob on a round rose on each face, on the side away from the hinge.
    kx = knob * (w / 2 - 0.075)
    for s in (-1, 1):
        k = lathe(f"{name}-knob{s}", [(0.0, 0.0), (0.028, 0.0), (0.028, 0.008), (0.012, 0.012), (0.008, 0.03), (0.02, 0.038), (0.027, 0.05), (0.02, 0.064), (0.0, 0.07)], "brass", 16)
        k.rotation_euler = (-s * math.pi / 2, 0, 0)
        k.location = (kx, s * t / 2, 1.0)
        bpy.context.view_layer.update()
        apply_transform(k)
        k["turned"] = False
        obs.append(k)
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


def lamp(name, cord=0.0, seed=0):
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
    obs = [outer, inner, rim, gallery, bulb]
    if cord:
        # The flex up to the ceiling, with a rose where it meets it.
        obs.append(lathe("cord", [(0.0, 0.2), (0.005, 0.2), (0.005, 0.2 + cord - 0.03), (0.0, 0.2 + cord - 0.03)], "iron", 8))
        obs.append(lathe("rose", [(0.0, 0.2 + cord - 0.03), (0.04, 0.2 + cord - 0.03), (0.045, 0.2 + cord - 0.01), (0.045, 0.2 + cord), (0.0, 0.2 + cord)], "wood", 16))
    return obs


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


def hbox(name, x0, x1, y0, y1, z0, z1, mat="wood", r=0.006, segments=2):
    """A board given in the house's own frame (three.js: y up, z toward the
    viewer), for the pieces modelled where they stand: Blender's x is the
    house's x, its y the house's -z, and its z the house's y."""
    return block(name, x0, x1, -z1, -z0, y0, y1, mat, r=r, segments=segments)


def H(x, y, z):
    """A point in the house's frame, in Blender's."""
    return (x, -z, y)


def flight(p):
    """The stairs, where they stand in the house: at every step a nosed tread
    over a riser set back under it, the space under each step boxed in, and a
    deep closed string up the open side with the steps housed in it."""
    x0, x1 = p["x"]
    zh, zf = p["z"]
    steps = p["steps"]
    rise = p["top"] / steps
    run = (zf - zh) / steps
    obs = []
    for i in range(steps):
        z1 = zf - i * run
        top = (i + 1) * rise
        obs.append(hbox(f"riser{i}", x0, x1, top - rise, top - 0.03, z1 - 0.025, z1 - 0.005, "wood", r=0.003))
        obs.append(hbox(f"tread{i}", x0 - 0.02, x1, top - 0.03, top, z1 - run, z1 + 0.03, "wood", r=0.014, segments=3))
        # The first step has nothing under it: a box of no height is no box.
        if i > 0:
            obs.append(hbox(f"under{i}", x0, x1, 0, top - rise, z1 - run, z1 - 0.005, "wood", r=0.002))
    # The string: a board 0.32 deep along the slope, its foot cut level on the floor.
    deep = 0.32
    bm = bmesh.new()
    sx0, sx1 = x0 - 0.055, x0 - 0.005
    foot = [(zf + 0.12, 0.0), (zf + 0.12, deep * 0.9)]
    head = [(zh - 0.12, p["top"] + deep * 0.45), (zh - 0.12, p["top"] - deep * 0.55)]
    outline = [foot[0], foot[1], head[0], head[1], (zf - 0.25, 0.0)]
    verts = []
    for x in (sx0, sx1):
        verts.append([bm.verts.new(H(x, y, z)) for z, y in outline])
    a, b = verts
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    n = len(outline)
    for k in range(n):
        k2 = (k + 1) % n
        bm.faces.new((a[k], b[k], b[k2], a[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    string = new_object("string", bm, "wood")
    bevel(string, 0.008, 2)
    obs.append(string)
    for o in obs:
        wear(o, 0.0012, 0.04, 3)
    return obs


HANDRAIL = [(0.035 + math.cos(math.pi - i / 8 * math.pi) * 0.035 - 0.035, 0.02 + math.sin(math.pi - i / 8 * math.pi) * 0.035 * 0.9) for i in range(9)]


def handrail(p):
    """A moulded handrail, round on top and flat beneath, along the slope from
    `a` to `b` (house points), on brackets where `brackets` asks for them."""
    ax, ay, az = p["a"]
    bx, by, bz = p["b"]
    n = 12
    path = [H(ax + (bx - ax) * t / n, ay + (by - ay) * t / n, az + (bz - az) * t / n) for t in range(n + 1)]
    profile = [(-0.035, 0.0)] + HANDRAIL + [(0.035, 0.0)]
    rail = sweep("rail", profile, path, "wood", closed=True)
    rail["smooth"] = True
    obs = [rail]
    for k, (z, y) in enumerate(p.get("brackets", [])):
        x = ax
        obs.append(hbox(f"bracket{k}", x - 0.07, x - 0.01, y - 0.12, y - 0.04, z - 0.02, z + 0.02, "iron", r=0.006))
    return obs


# ---------------------------------------------------------------- trim

ARCHITRAVE = [(0, 0.034), (0.02, 0.04), (0.03, 0.036), (0.036, 0.022), (0.12, 0.018), (0.13, 0.012), (0.135, 0.0)]
SLIM = [(0, 0.03), (0.035, 0.03), (0.045, 0.024), (0.05, 0.012), (0.05, 0.0)]
# A dado rail: a rounded nosing over a small bead, 6 cm high.
DADO = [(0, 0.012), (0.012, 0.026), (0.026, 0.034), (0.04, 0.032), (0.052, 0.022), (0.06, 0.01), (0.06, 0.0)]
SKIRTING = [(0, 0.02), (0.15, 0.02), (0.165, 0.026), (0.175, 0.02), (0.185, 0.01), (0.19, 0.0)]


def mitred(name, prof, pts, face_y, out_sign, mat, loop=False):
    """A moulding swept along a path in a wall's plane (Blender x, z), its
    corners mitred: at every corner the profile is stretched along the
    bisector so both runs meet square. `prof` is (across, out) points, across
    measured outward from the path, out from the wall's face at y = face_y."""
    W = max(a for a, _ in prof)
    # Closed against the wall: the profile runs out along its face and back along the wall.
    poly = [(0.0, 0.0)] + list(prof) + [(W, 0.0)]
    bm = bmesh.new()
    rings = []
    n = len(pts)
    for i, (px, pz) in enumerate(pts):
        def normal(d):
            return Vector((-d.y, d.x))
        if loop:
            d0 = (Vector(pts[i]) - Vector(pts[i - 1])).normalized()
            d1 = (Vector(pts[(i + 1) % n]) - Vector(pts[i])).normalized()
            n0, n1 = normal(d0), normal(d1)
            avg = (n0 + n1).normalized()
            nrm = avg / max(0.2, avg.dot(n0))
        elif i == 0:
            d = (Vector(pts[1]) - Vector(pts[0])).normalized()
            nrm = normal(d)
        elif i == n - 1:
            d = (Vector(pts[-1]) - Vector(pts[-2])).normalized()
            nrm = normal(d)
        else:
            d0 = (Vector(pts[i]) - Vector(pts[i - 1])).normalized()
            d1 = (Vector(pts[i + 1]) - Vector(pts[i])).normalized()
            n0, n1 = normal(d0), normal(d1)
            avg = (n0 + n1).normalized()
            nrm = avg / max(0.2, avg.dot(n0))
        rings.append([bm.verts.new((px + nrm.x * a, face_y + out_sign * o, pz + nrm.y * a)) for a, o in poly])
    m = len(poly)
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if loop else [])
    for ra, rb in pairs:
        for k in range(m):
            k2 = (k + 1) % m
            bm.faces.new((ra[k], ra[k2], rb[k2], rb[k]))
    if not loop:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_object(name, bm, mat)


def casing(p):
    """The frame round a door or an arch, on both faces of its wall: an
    architrave (or the front door's slim stop) up each jamb and across the
    head, its corners mitred; an arch's runs up the jambs and round the arch."""
    w, h, T = p["w"], p["h"], p["T"]
    prof = SLIM if p.get("profile") == "slim" else ARCHITRAVE
    if p.get("fit"):
        # Narrowed to the room beside the opening, so it stops short of a wall that meets this one.
        k = p["fit"] / max(a for a, _ in prof)
        prof = [(a * k, o) for a, o in prof]
    W = max(a for a, _ in prof)
    # Across from the opening's edge outward: the back band is on the outer edge.
    prof = [(W - a, o) for a, o in prof][::-1]
    r = w / 2
    if p["shape"] == "arch":
        spring = h - r
        path = [(-r, 0.0), (-r, spring)]
        for k in range(1, 16):
            a = math.pi - math.pi * k / 16
            path.append((r * math.cos(a), spring + r * math.sin(a)))
        path += [(r, spring), (r, 0.0)]
    else:
        path = [(-r, 0.0), (-r, h), (r, h), (r, 0.0)]
    obs = []
    for s in (-1, 1):
        # The path runs clockwise seen from y = -inf; from the other face the outward side flips.
        pts = path if s < 0 else path
        ob = mitred(f"casing{s}", prof if s < 0 else prof, pts, s * T / 2, s, "wood")
        obs.append(ob)
    # The far side's outward normal: mirror its across so it too runs outward.
    for o in obs:
        wear(o, 0.0008, 0.04, 5)
    return obs


def skirting(p):
    """A run of skirting board along +x from 0, its back on the wall at
    Blender y = 0 and its face toward -y (the room)."""
    L = p["length"]
    prof = DADO if p.get("profile") == "dado" else SKIRTING
    bm = bmesh.new()
    poly = [(0.0, 0.0)] + [(a, b) for a, b in prof]
    rings = [[bm.verts.new((x, -b, a)) for a, b in poly] for x in (0.0, L)]
    m = len(poly)
    a, b = rings
    for k in range(m):
        k2 = (k + 1) % m
        bm.faces.new((a[k], a[k2], b[k2], b[k]))
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_object("skirting", bm, "wood")
    return [ob]


def window(p):
    """A window in its wall, the room on Blender -y (the house's +z): the
    night in the opening, a frame round it, a sill standing out under it,
    a mullion and a transom, and its curtains (a valance only, or a valance
    and falls either side), hung in folds."""
    w, h, T = p["w"], p["h"], p["T"]
    obs = []
    face = -T / 2
    pane = bpy.data.meshes.new("pane")
    # Facing the room (-y): the night is seen from inside.
    pane.from_pydata([(-w / 2, 0, 0), (w / 2, 0, 0), (w / 2, 0, h), (-w / 2, 0, h)], [], [(0, 1, 2, 3)])
    po = bpy.data.objects.new("pane", pane)
    bpy.context.scene.collection.objects.link(po)
    po.data.materials.append(material("night"))
    obs.append(po)
    obs.append(block("sill", -w / 2 - 0.06, w / 2 + 0.06, face - 0.05, face + 0.02, -0.05, 0.0, "wood", r=0.008))
    obs.append(block("head", -w / 2 - 0.06, w / 2 + 0.06, face - 0.03, face + 0.02, h, h + 0.06, "wood", r=0.006))
    obs.append(block("jambL", -w / 2 - 0.06, -w / 2, face - 0.03, face + 0.02, 0, h, "wood", r=0.006))
    obs.append(block("jambR", w / 2, w / 2 + 0.06, face - 0.03, face + 0.02, 0, h, "wood", r=0.006))
    obs.append(block("mullion", -0.02, 0.02, -0.02, 0.02, 0, h, "wood", r=0.005))
    obs.append(block("transom", -w / 2, w / 2, -0.02, 0.02, h / 2 - 0.02, h / 2 + 0.02, "wood", r=0.005))
    return obs


def curtains(p):
    """A window's curtains, hung in folds in front of it on the room's side
    (Blender -y): a valance only, or a valance and a fall at one side or both."""
    w, h, T = p["w"], p["h"], p["T"]
    face = -T / 2
    obs = []
    cur = p["curtains"]
    if True:
        def cloth(a, b, z0, z1, off, seed):
            cw, ch = b - a, z1 - z0
            nx, nz = max(12, int(cw / 0.015)), 10
            bm = bmesh.new()
            count = max(3, round(cw / 0.09))
            grid = []
            for j in range(nz + 1):
                row = []
                for i in range(nx + 1):
                    u = i / nx
                    v = j / nz
                    down = 0.55 + 0.45 * (1 - v)
                    ph = seed * 1.7 + math.sin(seed * 3.1) * 0.6
                    depth = 0.025 * down * math.sin(u * count * math.pi * 2 + ph) + 0.006 * math.sin(u * count * 5.3 + ph)
                    row.append(bm.verts.new((a + u * cw, face - off - depth, z0 + v * ch)))
                grid.append(row)
            for j in range(nz):
                for i in range(nx):
                    bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            ob = new_object("curtain", bm, "curtain")
            apply(ob, ("SOLIDIFY", {"thickness": 0.003}))
            ob["smooth"] = True
            ob["islands"] = True
            return ob
        obs.append(cloth(-w / 2 - 0.15 if cur != "valance" else -w / 2 - 0.02, w / 2 + 0.15 if cur != "valance" else w / 2 + 0.08,
                         h - (0.33 if cur != "valance" else 0.15), h + (0.12 if cur != "valance" else 0.4), 0.06, 1))
        if cur in ("one", "both"):
            obs.append(cloth(w / 2 - 0.2, w / 2 + 0.14, -0.3, h, 0.07, 2))
        if cur == "both":
            obs.append(cloth(-w / 2 - 0.14, -w / 2 + 0.12, -0.25, h, 0.07, 3))
    return obs




def picture(p):
    """A picture in a moulded frame, hung flat on a wall, its face toward
    Blender -y: a frame of four mitred lengths round the picture's own canvas."""
    w, h = p["w"], p["h"]
    fw = p.get("frame", 0.05)
    prof = [(0.0, 0.012), (0.012, 0.026), (0.03, 0.03), (fw - 0.008, 0.02), (fw, 0.008)]
    path = [(-w / 2, -h / 2), (-w / 2, h / 2), (w / 2, h / 2), (w / 2, -h / 2)]
    # The frame's moulding runs outward from the canvas's edge, round in a loop.
    frame = mitred("frame", [(a, o) for a, o in prof], path, 0.0, -1, "wood", loop=True)
    art = bpy.data.meshes.new("art")
    art.from_pydata([(-w / 2, -0.004, -h / 2), (w / 2, -0.004, -h / 2), (w / 2, -0.004, h / 2), (-w / 2, -0.004, h / 2)], [], [(0, 1, 2, 3)])
    ao = bpy.data.objects.new("art", art)
    bpy.context.scene.collection.objects.link(ao)
    # An empty frame shows the wall's paper where the picture was.
    ao.data.materials.append(material("wall#7a8a6a" if p.get("empty") else "picture"))
    back = block("back", -w / 2, w / 2, -0.002, 0.0, -h / 2, h / 2, "wood", r=0)
    return [frame, ao, back]


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
        v.co = Vector((x * k, y * k, max(0.01, h)))
    ob.data.materials.append(material("cloth"))
    ob["smooth"] = True
    return [ob]


# ---------------------------------------------------------------- the furniture kit
#
# Every piece of furniture.js, modelled. Each is built in the kit's own frame,
# given in the house's axes (hbox): standing on the floor at y = 0, its back
# to a wall at z = 0 and its front toward +z, or centred on its origin where
# the kit centres it. Slots in their own paint are named `slot#rrggbb`.


def hturn(name, prof, mat, x, y, z, seg=24, front=False, cap=True):
    """A turned piece at a house point: its axis up the house's y, or toward
    the room (+z) when `front`. Its placement is kept off its vertices, so its
    texture unrolls round its own axis."""
    ob = lathe(name, prof, mat, seg, cap=cap)
    if front:
        ob.rotation_euler = (math.pi / 2, 0, 0)
    ob.location = H(x, y, z)
    ob["turned"] = True
    return ob


def hpoly(name, pts, x0, x1, mat):
    """A board of outline `pts` ((z, y) in the house's frame) between x0 and x1."""
    bm = bmesh.new()
    a = [bm.verts.new(H(x0, y, z)) for z, y in pts]
    b = [bm.verts.new(H(x1, y, z)) for z, y in pts]
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    n = len(pts)
    for k in range(n):
        k2 = (k + 1) % n
        bm.faces.new((a[k], b[k], b[k2], a[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_object(name, bm, mat)


def hsegment(name, p0, p1, thick, z0, z1, mat, r=0.003):
    """A straight bar in a wall's plane (house x, y) from p0 to p1, between
    house depths z0 and z1: a crack, a slat, a plank across a door."""
    (ax, ay), (bx, by) = p0, p1
    d = Vector((bx - ax, by - ay))
    L = d.length
    ob = hbox(name, -L / 2, L / 2, -thick / 2, thick / 2, z0, z1, mat, r=r)
    ob.rotation_euler = (0, -math.atan2(d.y, d.x), 0)
    ob.location = H((ax + bx) / 2, (ay + by) / 2, 0)
    return ob


def knob(name, x, y, z, mat="brass", s=1.0):
    """A turned knob on a front, pointing into the room."""
    prof = [(0.0, 0.0), (0.012 * s, 0.0), (0.014 * s, 0.006 * s), (0.008 * s, 0.012 * s), (0.016 * s, 0.022 * s), (0.014 * s, 0.03 * s), (0.0, 0.032 * s)]
    return hturn(name, prof, mat, x, y, z, 12, front=True)


def turned_leg(name, x, z, y0, y1, r, mat="wood"):
    """A leg turned on a lathe: a bun foot, a long taper, a ring and a neck."""
    h = y1 - y0
    prof = [(0.0, 0.0), (r * 0.7, 0.0), (r * 0.9, 0.012), (r * 0.75, 0.03), (r * 0.6, 0.05), (r * 0.72, h * 0.45), (r * 0.85, h * 0.7), (r, h * 0.78), (r * 0.7, h * 0.82), (r * 0.8, h * 0.9), (r, h), (0.0, h)]
    return hturn(name, prof, mat, x, y0, z, 16)


def fielded(name, x0, x1, y0, y1, z, mat, frame=0.05, raise_=0.012):
    """A panel with a frame round a raised, chamfered field, its face at depth z."""
    obs = [hbox(f"{name}-frame", x0, x1, y0, y1, z - 0.018, z, mat, r=0.004)]
    fx0, fx1, fy0, fy1 = x0 + frame, x1 - frame, y0 + frame, y1 - frame
    if fx1 - fx0 > 0.04 and fy1 - fy0 > 0.04:
        obs.append(hbox(f"{name}-field", fx0, fx1, fy0, fy1, z - 0.004, z + raise_, mat, r=min(0.014, (fx1 - fx0) / 4), segments=1))
    return obs


def plan_turn(name, prof, A, B, mats, cx=0.0, cz=0.0, n=48, e=3.2):
    """A shape turned round a rounded rectangle rather than a circle: a bath,
    a basin. `prof` is (offset, y, material index) from the outside bottom,
    over the rim, down the inside; each ring is the rectangle grown by its
    offset."""
    bm = bmesh.new()
    rings = []
    for off, y, _ in prof:
        a, b = max(0.002, A + off), max(0.002, B + off)
        ring = []
        for i in range(n):
            t = 2 * math.pi * i / n
            c, s_ = math.cos(t), math.sin(t)
            x = a * math.copysign(abs(c) ** (2 / e), c)
            z = b * math.copysign(abs(s_) ** (2 / e), s_)
            ring.append(bm.verts.new(H(cx + x, y, cz + z)))
        rings.append(ring)
    for k, (ra, rb) in enumerate(zip(rings, rings[1:])):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((ra[i], ra[j], rb[j], rb[i]))
            f.material_index = prof[k][2]
    f = bm.faces.new(rings[0][::-1])
    f.material_index = prof[0][2]
    f = bm.faces.new(rings[-1])
    f.material_index = prof[-1][2]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_object(name, bm, mats)
    ob["smooth"] = True
    return ob


def seeded(seed):
    r = [seed]

    def rnd():
        r[0] = (r[0] * 16807) % 2147483647
        return r[0] / 2147483647

    return rnd


def chest_carcass(p):
    """A chest of drawers on a plinth, back to the wall, without its drawers:
    sides, a back, a moulded top, dust boards the drawers run on, and the
    rails between them at the front. Its drawers are their own models."""
    w, h, d, count = p["w"], p["h"], p["d"], p["drawers"]
    obs = []
    obs.append(hbox("plinth", -w / 2 + 0.02, w / 2 - 0.02, 0, 0.08, 0.02, d - 0.02, "wood", r=0.008, segments=2))
    obs.append(hbox("side-l", -w / 2, -w / 2 + 0.02, 0.08, h - 0.03, 0, d, "wood", r=0.004))
    obs.append(hbox("side-r", w / 2 - 0.02, w / 2, 0.08, h - 0.03, 0, d, "wood", r=0.004))
    obs.append(hbox("back", -w / 2 + 0.02, w / 2 - 0.02, 0.08, h - 0.03, 0.0, 0.015, "wood", r=0.002))
    obs.append(hbox("inside", -w / 2 + 0.02, w / 2 - 0.02, 0.1, h - 0.05, 0.015, 0.02, "black", r=0))
    obs.append(hbox("top", -w / 2 - 0.02, w / 2 + 0.02, h - 0.03, h, -0.005, d + 0.025, "wood", r=0.012, segments=3))
    span = h - 0.2
    edges = []
    for i in range(count):
        top = h - 0.06 - (span / count) * i
        bot = top - span / count + 0.03
        edges.append((bot, top))
    # The rails: under the top, between each drawer, and over the plinth.
    ys = [(edges[0][1], h - 0.03)] + [(edges[i + 1][1], edges[i][0]) for i in range(count - 1)] + [(0.08, edges[-1][0])]
    for k, (y0, y1) in enumerate(ys):
        if y1 - y0 < 0.005:
            continue
        obs.append(hbox(f"rail{k}", -w / 2 + 0.02, w / 2 - 0.02, y0, y1, d - 0.03, d, "wood", r=0.003))
        obs.append(hbox(f"dust{k}", -w / 2 + 0.02, w / 2 - 0.02, y0, min(y1, y0 + 0.012), 0.02, d - 0.03, "wood", r=0))
    # The stiles: the front of each side, as wide as the margin the drawers leave.
    obs.append(hbox("stile-l", -w / 2, -w / 2 + 0.05, 0.08, h - 0.03, d - 0.03, d, "wood", r=0.004))
    obs.append(hbox("stile-r", w / 2 - 0.05, w / 2, 0.08, h - 0.03, d - 0.03, d, "wood", r=0.004))
    for o in obs:
        wear(o, 0.001, 0.04, 2)
    return obs


def drawer(p):
    """One drawer of a chest, closed: a front in the chest's paint with two
    knobs, and behind it the box it is, sides, back and bottom, dark inside."""
    w, d, bot, top = p["w"], p["d"], p["bot"], p["top"]
    paint = p.get("paint", "door#d8ccb8")
    obs = []
    obs.append(hbox("front", -w / 2 + 0.05, w / 2 - 0.05, bot, top, d - 0.02, d + 0.005, paint, r=0.006, segments=2))
    # A bead round the front, as a cock-beaded drawer has.
    obs.append(hbox("field", -w / 2 + 0.075, w / 2 - 0.075, bot + 0.025, top - 0.025, d + 0.003, d + 0.008, paint, r=0.004, segments=2))
    inner = (-w / 2 + 0.07, w / 2 - 0.07)
    back = 0.04
    obs.append(hbox("side-l", inner[0], inner[0] + 0.015, bot + 0.01, top - 0.03, back, d - 0.02, "wood", r=0.002))
    obs.append(hbox("side-r", inner[1] - 0.015, inner[1], bot + 0.01, top - 0.03, back, d - 0.02, "wood", r=0.002))
    obs.append(hbox("back", inner[0], inner[1], bot + 0.01, top - 0.03, back, back + 0.015, "wood", r=0.002))
    obs.append(hbox("bottom", inner[0], inner[1], bot + 0.01, bot + 0.02, back, d - 0.02, "wood", r=0))
    obs.append(hbox("dark", inner[0] + 0.015, inner[1] - 0.015, bot + 0.02, bot + 0.025, back + 0.015, d - 0.02, "black", r=0))
    for kx in (-w / 4, w / 4):
        obs.append(knob(f"knob{kx}", kx, (top + bot) / 2, d + 0.008))
    return obs


def table(p):
    """A table centred on its origin: a top with a rounded edge over an apron
    of boards, on four turned legs squared where they meet the apron."""
    w, d, h = p["w"], p["d"], p["h"]
    obs = [hbox("top", -w / 2, w / 2, h - 0.035, h, -d / 2, d / 2, "wood", r=0.012, segments=3)]
    ay0, ay1 = h - 0.13, h - 0.035
    for sz in (-1, 1):
        z = sz * (d / 2 - 0.06)
        obs.append(hbox(f"apron-x{sz}", -w / 2 + 0.06, w / 2 - 0.06, ay0, ay1, z - 0.01, z + 0.01, "wood", r=0.003))
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.06)
        obs.append(hbox(f"apron-z{sx}", x - 0.01, x + 0.01, ay0, ay1, -d / 2 + 0.06, d / 2 - 0.06, "wood", r=0.003))
    for sx in (-1, 1):
        for sz in (-1, 1):
            x = sx * (w / 2 - 0.07)
            z = sz * (d / 2 - 0.07)
            obs.append(hbox(f"block{sx}{sz}", x - 0.03, x + 0.03, ay0 - 0.03, ay1, z - 0.03, z + 0.03, "wood", r=0.004))
            obs.append(turned_leg(f"leg{sx}{sz}", x, z, 0, ay0 - 0.03, 0.032))
    for o in obs:
        wear(o, 0.001, 0.04, 4)
    return obs


def bed(p):
    """A bed, head to the wall: posts with turned finials, a panelled head
    and foot, side rails, a mattress, pillows, and a cover over it that hangs
    down the sides, turned back if the bed is not made."""
    w, l, made, cover = p["w"], p["l"], p["made"], p["cover"]
    cloth = f"curtain#{cover}"
    obs = []
    for z0, z1, hh in ((0.0, 0.06, 1.1), (l - 0.06, l, 0.6)):
        for sx in (-1, 1):
            x = sx * (w / 2 - 0.03)
            obs.append(hbox(f"post{z0}{sx}", x - 0.035, x + 0.035, 0, hh, z0, z1, "wood", r=0.01, segments=2))
            obs.append(hturn(f"finial{z0}{sx}", [(0.0, 0.0), (0.03, 0.0), (0.034, 0.01), (0.02, 0.03), (0.032, 0.055), (0.012, 0.08), (0.0, 0.085)], "wood", x, hh, (z0 + z1) / 2, 16))
        obs.append(hbox(f"toprail{z0}", -w / 2 + 0.06, w / 2 - 0.06, hh - 0.09, hh - 0.02, z0 + 0.005, z1 - 0.005, "wood", r=0.012, segments=3))
        obs.append(hbox(f"lowrail{z0}", -w / 2 + 0.06, w / 2 - 0.06, 0.18, 0.26, z0 + 0.01, z1 - 0.01, "wood", r=0.006))
        n = max(2, round((w - 0.12) / 0.32))
        pw = (w - 0.12) / n
        for k in range(n):
            a = -w / 2 + 0.06 + k * pw
            obs += fielded(f"panel{z0}{k}", a + 0.01, a + pw - 0.01, 0.26, hh - 0.09, z1 - 0.012 if z0 == 0 else z0 + 0.03, "wood", frame=0.035, raise_=0.008)
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.03)
        obs.append(hbox(f"side{sx}", x - 0.025, x + 0.025, 0.18, 0.36, 0.06, l - 0.06, "wood", r=0.008))
    obs.append(hbox("mattress", -w / 2 + 0.06, w / 2 - 0.06, 0.3, 0.5, 0.06, l - 0.06, "curtain#c8ccb4", r=0.05, segments=4))
    for k, x in enumerate([-w / 4, w / 4] if w > 1 else [0.0]):
        # A pillow: a soft block, plumper in the middle. (A squashed sphere
        # unwrapped into islands showed its cloth at 1.7 times its size.)
        pil = hbox(f"pillow{k}", x - 0.25, x + 0.25, 0.49, 0.61, 0.12, 0.45, "curtain#e0e2d0", r=0.05, segments=4)
        for v in pil.data.vertices:
            v.co.z += 0.025 * max(0.0, 1 - ((v.co.x - x) / 0.25) ** 2) * (1 if v.co.z > 0.55 else -0.4)
        pil["smooth"] = True
        obs.append(pil)
    # The cover: a sheet laid over the mattress from `fold` to the foot,
    # falling down both sides in folds.
    fold = 0.55 if made else 1.2
    top = 0.515
    drop = 0.3
    bm = bmesh.new()
    across = w - 0.12 + 2 * drop
    nx, nz = 40, 30
    grid = []
    for j in range(nz + 1):
        row = []
        z = fold + (l - 0.08 - fold) * j / nz
        for i in range(nx + 1):
            a = -across / 2 + across * i / nx
            edge = (w - 0.12) / 2
            if abs(a) <= edge:
                x, y = a, top + 0.012 * math.cos(a / edge * math.pi / 2)
            else:
                over = abs(a) - edge
                x = math.copysign(edge + 0.012 + 0.025 * math.sin(over / drop * math.pi / 2), a)
                y = top - over
            # Folds in the hanging part, and a little give over the mattress.
            fz = 0.012 * math.sin(z * 9 + a * 2) * min(1, max(0, abs(a) - edge + 0.05) / 0.1)
            x += math.copysign(fz, a)
            row.append(bm.verts.new(H(x, y, z)))
        grid.append(row)
    # Laid flat, the cover is a rectangle: its texture is laid by where each
    # point is across and along it, which is exact. (Unwrapped into islands
    # and evened out, the sheet of a small bed showed its cloth up to 1.4
    # times its size.)
    uvl = bm.loops.layers.uv.new()
    mu, mv = metres_of(cloth)
    for j in range(nz):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for lo, (ii, jj) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lo[uvl].uv = ((-across / 2 + across * ii / nx) / mu, (fold + (l - 0.08 - fold) * jj / nz) / mv)
    sheet = new_object("cover", bm, cloth)
    apply(sheet, ("SOLIDIFY", {"thickness": 0.012}))
    sheet["smooth"] = True
    sheet["uvdone"] = True
    obs.append(sheet)
    if not made:
        # The cover turned back at the fold, in a soft roll.
        roll = sweep("turned-back", [(0.035 * math.cos(t / 10 * 2 * math.pi), 0.025 * math.sin(t / 10 * 2 * math.pi)) for t in range(10)], [H(x, top + 0.02, fold - 0.02) for x in (-(w - 0.12) / 2 - 0.02, 0, (w - 0.12) / 2 + 0.02)], cloth, closed=True)
        roll["smooth"] = True
        obs.append(roll)
    for o in obs:
        wear(o, 0.0015, 0.05, 6)
    return obs


def wardrobe(p):
    """A wardrobe, back to the wall: a plinth, a carcass, a cornice stepped
    out over it, and two panelled doors with knobs."""
    w, h, d = p["w"], p["h"], p["d"]
    obs = []
    obs.append(hbox("plinth", -w / 2 + 0.01, w / 2 - 0.01, 0, 0.1, 0.0, d - 0.01, "wood", r=0.01, segments=2))
    obs.append(hbox("carcass", -w / 2, w / 2, 0.1, h, 0, d - 0.02, "wood", r=0.006))
    for k, (o, y0, y1, r) in enumerate([(0.01, h, h + 0.03, 0.004), (0.03, h + 0.03, h + 0.06, 0.014), (0.04, h + 0.06, h + 0.08, 0.008)]):
        obs.append(hbox(f"cornice{k}", -w / 2 - o, w / 2 + o, y0, y1, -0.005, d + o - 0.01, "wood", r=r, segments=3))
    gap = 0.004
    for sx in (-1, 1):
        x0, x1 = (gap, w / 2 - 0.03) if sx > 0 else (-w / 2 + 0.03, -gap)
        paint = "door#c8bca8"
        obs.append(hbox(f"door{sx}", x0, x1, 0.12, h - 0.04, d - 0.04, d - 0.02, paint, r=0.005))
        mid = 0.12 + (h - 0.16) * 0.42
        obs += fielded(f"lo{sx}", x0 + 0.05, x1 - 0.05, 0.17, mid - 0.04, d - 0.002, paint, frame=0.03)
        obs += fielded(f"hi{sx}", x0 + 0.05, x1 - 0.05, mid + 0.04, h - 0.09, d - 0.002, paint, frame=0.03)
        obs.append(knob(f"knob{sx}", sx * 0.04, h * 0.5, d - 0.02))
    for o in obs:
        wear(o, 0.0012, 0.05, 7)
    return obs


SPINES = ["6a4a38", "3a4a38", "7a6a50", "4a3a40", "8a7a5a", "50503a"]


def bookcase(p):
    """Shelves of books, back to the wall: sides, a plinth, a top with an
    overhang, a back, shelves, and books whose spines are seeded."""
    w, h, d, seed, gaps = p["w"], p["h"], p["d"], p["seed"], p["gaps"]
    obs = []
    obs.append(hbox("side-l", -w / 2, -w / 2 + 0.03, 0, h - 0.03, 0, d, "wood", r=0.004))
    obs.append(hbox("side-r", w / 2 - 0.03, w / 2, 0, h - 0.03, 0, d, "wood", r=0.004))
    obs.append(hbox("plinth", -w / 2 + 0.03, w / 2 - 0.03, 0, 0.08, 0.0, d - 0.01, "wood", r=0.004))
    obs.append(hbox("top", -w / 2 - 0.015, w / 2 + 0.015, h - 0.03, h, 0, d + 0.02, "wood", r=0.01, segments=3))
    obs.append(hbox("back", -w / 2 + 0.03, w / 2 - 0.03, 0.08, h - 0.03, 0, 0.012, "wood#605848", r=0))
    rnd = seeded(seed)
    shelves = 4
    for i in range(shelves):
        y = 0.08 + ((h - 0.12) / shelves) * i
        obs.append(hbox(f"shelf{i}", -w / 2 + 0.03, w / 2 - 0.03, y, y + 0.022, 0.012, d - 0.005, "wood", r=0.004))
        x = -w / 2 + 0.04
        k = 0
        while x < w / 2 - 0.1:
            bw = 0.025 + rnd() * 0.035
            if rnd() < gaps:
                x += bw * 2
                continue
            bh = 0.2 + rnd() * 0.14
            lean = rnd() < 0.08
            col = SPINES[int(rnd() * len(SPINES))]
            back = d - 0.03 - rnd() * 0.04
            b = hbox(f"book{i}-{k}", x, x + bw, y + 0.022, y + 0.022 + (bh * 0.8 if lean else bh), 0.04, back, f"paper#{col}", r=min(0.004, bw / 4), segments=2)
            obs.append(b)
            x += bw + 0.003
            k += 1
    for o in obs:
        wear(o, 0.0008, 0.03, seed)
    return obs


def fireplace(p):
    """A fireplace gone cold, against a wall: the chimney breast, a surround
    of pilasters and a frieze under a moulded mantel shelf, an iron insert
    round a black opening, a hearth, and a grate with ash in it."""
    w, h, d = p["w"], p["h"], p["d"]
    obs = [hbox("breast", -w / 2, w / 2, 0, h, 0, d, "wall", r=0)]
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 0.4, sx * 0.62))
        obs.append(hbox(f"pilaster{sx}", x0, x1, 0, 1.0, d, d + 0.05, "wood", r=0.006))
        obs.append(hbox(f"plinth{sx}", x0 - 0.01, x1 + 0.01, 0, 0.14, d, d + 0.065, "wood", r=0.005))
        obs.append(hbox(f"capital{sx}", x0 - 0.012, x1 + 0.012, 0.94, 1.0, d, d + 0.065, "wood", r=0.008, segments=2))
    obs.append(hbox("frieze", -0.62, 0.62, 0.86, 1.0, d, d + 0.045, "wood", r=0.005))
    obs.append(hbox("bed-mould", -0.66, 0.66, 1.0, 1.04, d - 0.01, d + 0.08, "wood", r=0.012, segments=3))
    obs.append(hbox("mantel", -0.74, 0.74, 1.04, 1.1, d - 0.02, d + 0.15, "wood", r=0.014, segments=3))
    # The iron insert: a frame round the opening, its head arched.
    obs.append(hbox("insert-l", -0.4, -0.32, 0.03, 0.86, d - 0.01, d + 0.01, "iron", r=0.004))
    obs.append(hbox("insert-r", 0.32, 0.4, 0.03, 0.86, d - 0.01, d + 0.01, "iron", r=0.004))
    arch = [(-0.32 + 0.64 * t / 12, 0.62 + 0.12 * math.sin(math.pi * t / 12)) for t in range(13)]
    bm = bmesh.new()
    pts = [(-0.4, 0.86)] + arch + [(0.4, 0.86)]
    head = []
    for zz in (d - 0.01, d + 0.01):
        head.append([bm.verts.new(H(x, y, zz)) for x, y in pts])
    a, b = head
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    for k in range(len(pts)):
        k2 = (k + 1) % len(pts)
        bm.faces.new((a[k], b[k], b[k2], a[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obs.append(new_object("insert-head", bm, "iron"))
    obs.append(hbox("opening", -0.32, 0.32, 0.03, 0.74, d - 0.3, d - 0.01, "black", r=0))
    obs.append(hbox("hearth", -0.7, 0.7, 0, 0.03, d, d + 0.5, "ceiling#8a8a7a", r=0.006))
    # The grate: a basket of bars on four legs.
    for k in range(7):
        x = -0.24 + 0.08 * k
        obs.append(hbox(f"bar{k}", x - 0.008, x + 0.008, 0.08, 0.24, d - 0.06, d - 0.045, "iron", r=0.003))
    obs.append(hbox("grate-base", -0.25, 0.25, 0.06, 0.09, d - 0.2, d - 0.04, "iron", r=0.005))
    for sx in (-1, 1):
        for zz in (d - 0.19, d - 0.05):
            obs.append(hbox(f"gleg{sx}{zz}", sx * 0.22 - 0.012, sx * 0.22 + 0.012, 0, 0.07, zz - 0.012, zz + 0.012, "iron", r=0.003))
    ash = hbox("ash", -0.2, 0.2, 0.09, 0.15, d - 0.18, d - 0.07, "ceiling#5a5a50", r=0.02, segments=3)
    for v in ash.data.vertices:
        v.co.z += 0.02 * noise.noise(Vector((v.co.x * 12, v.co.y * 12, 1.3)))
    obs.append(ash)
    for o in obs[1:]:
        wear(o, 0.0012, 0.04, 8)
    return obs


def range_(p):
    """A kitchen range: black iron with a plinth, two oven doors with a rail
    across them, hot plates, a back plate and a shelf, the flue to the
    ceiling, and a kettle left on a plate."""
    w, d, ceiling = p["w"], p["d"], p["ceiling"]
    obs = []
    obs.append(hbox("plinth", -w / 2 + 0.03, w / 2 - 0.03, 0, 0.06, 0.03, d - 0.03, "iron", r=0.006))
    obs.append(hbox("body", -w / 2, w / 2, 0.06, 0.86, 0, d, "iron", r=0.012, segments=2))
    obs.append(hbox("top", -w / 2 - 0.015, w / 2 + 0.015, 0.86, 0.89, -0.005, d + 0.015, "iron", r=0.006))
    for sx in (-1, 1):
        x0, x1 = (0.03, w / 2 - 0.06) if sx > 0 else (-w / 2 + 0.06, -0.03)
        obs.append(hbox(f"oven{sx}", x0, x1, 0.15, 0.7, d, d + 0.02, "iron#6a6a60", r=0.008))
        obs.append(hbox(f"panel{sx}", x0 + 0.04, x1 - 0.04, 0.2, 0.65, d + 0.02, d + 0.03, "iron#6a6a60", r=0.006))
        obs.append(hbox(f"latch{sx}", (x0 + x1) / 2 - 0.03, (x0 + x1) / 2 + 0.03, 0.6, 0.62, d + 0.02, d + 0.05, "iron", r=0.004))
    rail = sweep("rail", [(0.009 * math.cos(t / 8 * 2 * math.pi), 0.009 * math.sin(t / 8 * 2 * math.pi)) for t in range(8)], [H(-w / 2 - 0.01, 0.78, d + 0.06), H(w / 2 + 0.01, 0.78, d + 0.06)], "brass", closed=True)
    rail["smooth"] = True
    obs.append(rail)
    for sx in (-1, 1):
        obs.append(hbox(f"railbracket{sx}", sx * (w / 2 - 0.02) - 0.008, sx * (w / 2 - 0.02) + 0.008, 0.76, 0.8, d, d + 0.065, "iron", r=0.003))
    for x in (-w / 4, w / 4):
        obs.append(hturn(f"plate{x}", [(0.0, 0.0), (0.12, 0.0), (0.125, 0.008), (0.12, 0.018), (0.0, 0.018)], "iron#3a3a34", x, 0.89, d / 2, 24))
    obs.append(hbox("back", -w / 2, w / 2, 0.89, 1.3, 0, 0.05, "iron", r=0.008))
    obs.append(hbox("shelf", -w / 2 - 0.02, w / 2 + 0.02, 1.3, 1.33, 0, 0.18, "iron", r=0.006))
    obs.append(hturn("flue", [(0.0, 0.0), (0.075, 0.0), (0.075, 0.03), (0.068, 0.04), (0.068, ceiling - 0.89 - 0.1), (0.085, ceiling - 0.89 - 0.06), (0.085, ceiling - 0.89), (0.0, ceiling - 0.89)], "iron", 0, 0.89, 0.12, 20))
    k = hturn("kettle", [(0.0, 0.0), (0.085, 0.0), (0.1, 0.03), (0.1, 0.09), (0.08, 0.13), (0.04, 0.15), (0.03, 0.16), (0.035, 0.17), (0.0, 0.175)], "iron#7a7a6a", -w / 4, 0.907, d / 2, 24)
    obs.append(k)
    spout = sweep("spout", [(0.012 * math.cos(t / 8 * 2 * math.pi), 0.012 * math.sin(t / 8 * 2 * math.pi)) for t in range(8)], [H(-w / 4 + 0.08 + 0.02 * t, 0.94 + 0.03 * t + 0.01 * t * t, d / 2) for t in range(5)], "iron#7a7a6a", closed=True)
    obs.append(spout)
    handle = sweep("handle", [(0.008 * math.cos(t / 8 * 2 * math.pi), 0.008 * math.sin(t / 8 * 2 * math.pi)) for t in range(8)], [H(-w / 4 + 0.07 * math.cos(math.pi * t / 10), 1.07 + 0.08 * math.sin(math.pi * t / 10), d / 2) for t in range(11)], "iron", closed=True)
    obs.append(handle)
    for o in obs:
        wear(o, 0.001, 0.04, 9)
    return obs


def dresser_base(p):
    """Cupboards under a worktop, on a dark plinth, with panelled doors; a
    sink let into the worktop, with a tap."""
    w, d, sink = p["w"], p["d"], p["sink"]
    obs = []
    obs.append(hbox("plinth", -w / 2 + 0.03, w / 2 - 0.03, 0, 0.08, 0, d - 0.06, "black", r=0.003))
    obs.append(hbox("carcass", -w / 2, w / 2, 0.08, 0.86, 0, d - 0.03, "wood", r=0.005))
    obs.append(hbox("worktop", -w / 2 - 0.02, w / 2 + 0.02, 0.86, 0.9, 0, d + 0.02, "wood#b0a890", r=0.01, segments=3))
    doors = max(2, round(w / 0.5))
    for i in range(doors):
        x0 = -w / 2 + 0.04 + ((w - 0.08) / doors) * i
        x1 = x0 + (w - 0.08) / doors - 0.02
        obs += fielded(f"door{i}", x0, x1, 0.12, 0.8, d - 0.01, "door#c8bca8", frame=0.04)
        obs.append(knob(f"knob{i}", x1 - 0.05 if i % 2 == 0 else x0 + 0.05, 0.7, d - 0.01))
    if sink:
        # A deep enamel sink, its walls and floor, standing proud of the worktop.
        x0, x1, z0, z1 = -0.3, 0.3, 0.08, d - 0.04
        t = 0.025
        obs.append(hbox("sink-floor", x0, x1, 0.7, 0.72, z0, z1, "enamel", r=0.006))
        obs.append(hbox("sink-front", x0, x1, 0.7, 0.93, z1 - t, z1, "enamel", r=0.01, segments=2))
        obs.append(hbox("sink-back", x0, x1, 0.7, 0.93, z0, z0 + t, "enamel", r=0.01, segments=2))
        obs.append(hbox("sink-l", x0, x0 + t, 0.7, 0.93, z0, z1, "enamel", r=0.01, segments=2))
        obs.append(hbox("sink-r", x1 - t, x1, 0.7, 0.93, z0, z1, "enamel", r=0.01, segments=2))
        obs.append(hbox("sink-stain", x0 + t, x1 - t, 0.72, 0.723, z0 + t, z1 - t, "enamel#48544a", r=0))
        obs.append(hturn("tap", [(0.0, 0.0), (0.025, 0.0), (0.025, 0.01), (0.012, 0.02), (0.012, 0.2), (0.0, 0.2)], "iron", 0, 0.9, 0.045, 12))
        spout = sweep("spout", [(0.01 * math.cos(t / 8 * 2 * math.pi), 0.01 * math.sin(t / 8 * 2 * math.pi)) for t in range(8)], [H(0, 1.1 - 0.07 * (1 - math.cos(math.pi / 2 * t / 6)), 0.045 + 0.1 * math.sin(math.pi / 2 * t / 6)) for t in range(7)], "iron", closed=True)
        obs.append(spout)
        obs.append(hbox("handle", -0.05, 0.05, 1.08, 1.095, 0.04, 0.05, "iron", r=0.004))
    for o in obs:
        wear(o, 0.001, 0.04, 10)
    return obs


def shelf(p):
    """A shelf on two shaped brackets, its back on the wall, with a rail in
    front that plates lean on, and jars and plates along it."""
    w, y, d, items, seed = p["w"], p["y"], p["d"], p["items"], p["seed"]
    obs = [hbox("board", -w / 2, w / 2, y, y + 0.03, 0, d, "wood", r=0.006, segments=2)]
    for x in (-w / 2 + 0.08, w / 2 - 0.08):
        obs.append(hpoly(f"bracket{x}", [(0.0, y), (d * 0.7, y), (d * 0.7, y - 0.02), (0.02, y - 0.18), (0.0, y - 0.18)], x - 0.012, x + 0.012, "wood"))
    rail = sweep("rail", [(0.006 * math.cos(t / 8 * 2 * math.pi), 0.006 * math.sin(t / 8 * 2 * math.pi)) for t in range(8)], [H(-w / 2 + 0.02, y + 0.06, d - 0.02), H(w / 2 - 0.02, y + 0.06, d - 0.02)], "wood", closed=True)
    obs.append(rail)
    for x in (-w / 2 + 0.02, w / 2 - 0.02):
        obs.append(hbox(f"rail-post{x}", x - 0.008, x + 0.008, y + 0.03, y + 0.07, d - 0.03, d - 0.012, "wood", r=0.003))
    rnd = seeded(seed)
    for i in range(items):
        x = -w / 2 + 0.12 + ((w - 0.24) / max(1, items - 1)) * i
        if rnd() < 0.5:
            hh = 0.12 + rnd() * 0.08
            obs.append(hturn(f"jar{i}", [(0.0, 0.0), (0.045, 0.0), (0.05, 0.01), (0.05, hh - 0.03), (0.035, hh - 0.015), (0.03, hh), (0.0, hh)], "enamel", x, y + 0.03, d / 2, 16))
        else:
            plate = lathe(f"plate{i}", [(0.0, 0.0), (0.06, 0.0), (0.1, 0.012), (0.11, 0.018), (0.105, 0.02), (0.0, 0.008)], "enamel", 24)
            plate.rotation_euler = (math.pi / 2 + 0.15, 0, 0)
            plate.location = H(x, y + 0.14, 0.05)
            plate["turned"] = True
            obs.append(plate)
    return obs


def bath(p):
    """A roll-top bath on four iron feet, back to the wall: turned round a
    rounded rectangle, white outside, stained inside, and a pair of taps."""
    l, w = p["l"], p["w"]
    A, B = l / 2 - 0.02, w / 2 - 0.02
    prof = [(-0.1, 0.12, 0), (-0.06, 0.17, 0), (-0.025, 0.38, 0), (-0.005, 0.56, 0), (0.008, 0.595, 0), (0.016, 0.61, 0), (0.012, 0.626, 0), (0.0, 0.632, 1), (-0.015, 0.625, 1), (-0.03, 0.59, 1), (-0.07, 0.42, 1), (-0.1, 0.3, 2), (-0.13, 0.21, 2), (-0.15, 0.2, 2)]
    obs = [plan_turn("tub", prof, A, B, ["enamel", "enamel#8a968a", "enamel#5a6a5a"], 0, w / 2 + 0.01)]
    for sx in (-1, 1):
        for sz in (-1, 1):
            obs.append(hturn(f"foot{sx}{sz}", [(0.0, 0.0), (0.035, 0.0), (0.045, 0.015), (0.03, 0.04), (0.022, 0.08), (0.035, 0.11), (0.05, 0.13), (0.0, 0.135)], "iron", sx * (l / 2 - 0.2), 0, w / 2 + 0.01 + sz * (w / 2 - 0.14), 16))
    for k, x in enumerate((-l / 2 + 0.1, -l / 2 + 0.2)):
        obs.append(hturn(f"tap{k}", [(0.0, 0.0), (0.018, 0.0), (0.012, 0.01), (0.012, 0.1), (0.02, 0.11), (0.02, 0.13), (0.0, 0.14)], "iron", x, 0.632, 0.07, 12))
        obs.append(hbox(f"cross{k}", x - 0.035, x + 0.035, 0.76, 0.772, 0.064, 0.076, "iron", r=0.004))
    return obs


def basin(p):
    """A basin on a pedestal, back to the wall, and over it a mirror in a
    moulded frame, cracked if `cracked`."""
    obs = [hturn("pedestal", [(0.0, 0.0), (0.12, 0.0), (0.12, 0.025), (0.085, 0.07), (0.062, 0.25), (0.066, 0.55), (0.1, 0.72), (0.12, 0.76), (0.0, 0.76)], "enamel", 0, 0, 0.2, 24)]
    prof = [(-0.1, 0.72, 0), (-0.04, 0.8, 0), (-0.01, 0.855, 0), (0.0, 0.875, 0), (-0.006, 0.886, 0), (-0.02, 0.884, 1), (-0.035, 0.86, 1), (-0.08, 0.82, 1), (-0.15, 0.78, 2), (-0.17, 0.775, 2)]
    obs.append(plan_turn("bowl", prof, 0.3, 0.215, ["enamel", "enamel#8a968a", "enamel#48544a"], 0, 0.235))
    obs.append(hturn("tap", [(0.0, 0.0), (0.016, 0.0), (0.011, 0.01), (0.011, 0.09), (0.018, 0.1), (0.0, 0.11)], "iron", 0, 0.875, 0.05, 12))
    # The mirror: glass in a frame on the wall.
    fw = 0.04
    prof_f = [(0.0, 0.01), (0.01, 0.022), (0.024, 0.026), (fw - 0.006, 0.016), (fw, 0.006)]
    path = [(-0.29, 1.19), (-0.29, 1.81), (0.29, 1.81), (0.29, 1.19)]
    obs.append(mitred("frame", prof_f, path, 0.0, -1, "wood", loop=True))
    me = bpy.data.meshes.new("glass")
    me.from_pydata([H(-0.29, 1.19, 0.006), H(0.29, 1.19, 0.006), H(0.29, 1.81, 0.006), H(-0.29, 1.81, 0.006)], [], [(0, 1, 2, 3)])
    glass = bpy.data.objects.new("glass", me)
    bpy.context.scene.collection.objects.link(glass)
    glass.data.materials.append(material("mirror"))
    obs.append(glass)
    obs.append(hbox("backing", -0.29, 0.29, 1.19, 1.81, 0.0, 0.004, "wood", r=0))
    if p.get("cracked"):
        lines = [(-0.05, 1.62, 0.22, 0.6), (0.04, 1.58, 0.16, -0.9), (-0.02, 1.48, 0.25, 2.2), (0.06, 1.66, 0.12, 0.2), (-0.08, 1.55, 0.2, -2.5)]
        for k, (x, y, ln, a) in enumerate(lines):
            obs.append(hsegment(f"crack{k}", (x, y), (x + math.cos(a) * ln, y + math.sin(a) * ln), 0.005, 0.0062, 0.0075, "black#101410", r=0))
    return obs


def pendant(p):
    """A pendant from the ceiling (y = 0 is the ceiling): a rose, a flex, and
    an enamel shade white inside with the bulb under it, or a bare bulb when
    there is no shade."""
    drop, r = p["drop"], p["r"]
    obs = [hturn("rose", [(0.0, -0.02), (0.045, -0.02), (0.05, -0.012), (0.04, 0.0), (0.0, 0.0)], "wood", 0, 0, 0, 16)]
    obs.append(hturn("flex", [(0.0, -drop + 0.03), (0.005, -drop + 0.03), (0.005, -0.02), (0.0, -0.02)], "iron", 0, 0, 0, 8))
    obs.append(hturn("holder", [(0.0, -drop - 0.02), (0.018, -drop - 0.02), (0.02, -drop + 0.03), (0.0, -drop + 0.03)], "brass", 0, 0, 0, 12))
    obs.append(hturn("bulb", [(0.0, -drop - 0.085), (0.02, -drop - 0.08), (0.032, -drop - 0.06), (0.03, -drop - 0.035), (0.016, -drop - 0.02), (0.0, -drop - 0.02)], "shade", 0, 0, 0, 16))
    if r > 0.01:
        prof = [(0.03, -drop + 0.02), (0.045 * r / 0.2, -drop + 0.005), (0.12 * r / 0.2, -drop - 0.03), (r * 0.9, -drop - 0.06), (r, -drop - 0.075)]
        outer = hturn("shade-out", prof, "enamel", 0, 0, 0, 32, cap=False)
        inner = hturn("shade-in", [(a * 0.985, b - 0.003) for a, b in prof], "shade", 0, 0, 0, 32, cap=False)
        for o in (outer, inner):
            o.data.polygons.foreach_set("use_smooth", [True] * len(o.data.polygons))
        orient(outer, (0, 0, -drop - 0.4), outward=True)
        orient(inner, (0, 0, -drop - 0.4), outward=False)
        obs += [outer, inner]
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.005, location=(0, 0, -drop - 0.075))
        rim = bpy.context.active_object
        rim.data.materials.append(material("enamel"))
        obs.append(rim)
    return obs


def table_lamp(p):
    """A table lamp: a turned base, a stem, and a pleated shade."""
    obs = [hturn("base", [(0.0, 0.0), (0.08, 0.0), (0.08, 0.012), (0.06, 0.03), (0.03, 0.05), (0.016, 0.07), (0.0, 0.07)], "brass", 0, 0, 0, 24)]
    obs.append(hturn("stem", [(0.0, 0.07), (0.011, 0.07), (0.011, 0.3), (0.02, 0.31), (0.012, 0.33), (0.0, 0.33)], "brass", 0, 0, 0, 12))
    bm = bmesh.new()
    n = 48
    rings = []
    for y, r in ((0.29, 0.16), (0.47, 0.09)):
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            rr = r * (1 + (0.03 if i % 2 else -0.03))
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), y)))
        rings.append(ring)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
    shade = new_object("shade", bm, "lampshade")
    orient(shade, (0, 0, 0.38), outward=True)
    apply(shade, ("SOLIDIFY", {"thickness": 0.003}))
    shade["turned"] = True
    obs.append(shade)
    return obs


def dead_door(p):
    """A door that is not a way through: a leaf in an architrave on the wall,
    barred across with planks nailed on, or simply shut for good."""
    w, h = p["w"], p["h"]
    obs = door_leaf("leaf", w, h, knob=1)
    for o in obs:
        o.location.y -= 0.026
    W = max(a for a, _ in ARCHITRAVE)
    prof = [(W - a, o) for a, o in ARCHITRAVE][::-1]
    obs.append(mitred("architrave", prof, [(-w / 2, 0.0), (-w / 2, h), (w / 2, h), (w / 2, 0.0)], 0.0, -1, "wood"))
    if p.get("barred"):
        for k, (y, a) in enumerate(((0.7, 0.08), (1.45, -0.06))):
            L = w + 0.35
            p0 = (-L / 2 * math.cos(a), y - L / 2 * math.sin(a))
            p1 = (L / 2 * math.cos(a), y + L / 2 * math.sin(a))
            obs.append(hsegment(f"plank{k}", p0, p1, 0.14, 0.09, 0.125, "wood", r=0.008))
            for s in (-1, 1):
                for dy in (-0.035, 0.035):
                    nx = s * (w / 2 + 0.06)
                    ny = y + s * (w / 2 + 0.06) * math.tan(a) + dy
                    obs.append(hturn(f"nail{k}{s}{dy}", [(0.0, 0.0), (0.008, 0.0), (0.008, 0.003), (0.0, 0.005)], "iron", nx, ny, 0.125, 8, front=True))
    return obs


def rug(p):
    """A rug laid flat, centred on its origin: a pile with a bound edge and a
    fringe at each end. Its texture is laid at the size it was cut from the
    painting, from the middle out, so a narrow rug shows the middle of it."""
    w, l = p["w"], p["l"]
    slot = "hallRug" if p.get("hall") else "rug"
    mu, mv = 1.72, 1.26
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    nx, nz = max(2, round(w / 0.1)), max(2, round(l / 0.1))
    grid = []
    for j in range(nz + 1):
        row = []
        z = -l / 2 + l * j / nz
        for i in range(nx + 1):
            x = -w / 2 + w * i / nx
            edge = min(abs(abs(x) - w / 2), abs(abs(z) - l / 2))
            # Clear of the floor's baked skin, 4 mm up: a pile at 8 mm flickered through it.
            y = 0.014 - (0.002 if edge < 0.02 else 0) + 0.0015 * noise.noise(Vector((x * 3, z * 3, 7.1)))
            row.append(bm.verts.new(H(x, y, z)))
        grid.append(row)
    for j in range(nz):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    # The hall's runner runs its pattern from the door end, as the painting's does.
    v0 = l / 2 / mv if p.get("hall") else 0.0
    sign = -1 if p.get("hall") else 1
    for f in bm.faces:
        for lo in f.loops:
            co = lo.vert.co
            lo[uv].uv = (0.5 + co.x / mu, v0 + sign * (-co.y) / mv)
    ob = new_object("pile", bm, slot)
    ob["uvdone"] = True
    obs = [ob]
    # The bound edge, all round, a little proud of the pile.
    for k, (x0, x1, z0, z1) in enumerate(((-w / 2, w / 2, -l / 2, -l / 2 + 0.02), (-w / 2, w / 2, l / 2 - 0.02, l / 2), (-w / 2, -w / 2 + 0.02, -l / 2, l / 2), (w / 2 - 0.02, w / 2, -l / 2, l / 2))):
        obs.append(hbox(f"edge{k}", x0, x1, 0.0, 0.016, z0, z1, "rug#3a3020", r=0.003))
    # The fringe: tassels at each end.
    for sz in (-1, 1):
        n = max(4, round(w / 0.04))
        for i in range(n):
            x = -w / 2 + 0.02 + (w - 0.04) * i / (n - 1)
            ln = 0.05 + 0.015 * noise.noise(Vector((x * 20, sz, 0.3)))
            z0, z1 = (l / 2, l / 2 + ln) if sz > 0 else (-l / 2 - ln, -l / 2)
            obs.append(hbox(f"tassel{sz}{i}", x - 0.005, x + 0.005, 0.0, 0.011, z0, z1, "rug#b8b090", r=0))
    return obs


def armchair(p):
    """An upholstered armchair, its seat centred on the origin and its back
    toward -z: a stuffed base on short turned legs, a domed cushion, a
    rounded back leaning a little, and rolled arms."""
    cloth = f"curtain#{p['cover']}"
    obs = []
    obs.append(hbox("base", -0.42, 0.42, 0.1, 0.4, -0.38, 0.38, cloth, r=0.04, segments=3))
    cushion = hbox("cushion", -0.3, 0.3, 0.38, 0.49, -0.26, 0.4, cloth, r=0.045, segments=4)
    for v in cushion.data.vertices:
        if v.co.z > 0.46:
            v.co.z += 0.02 * (1 - (v.co.x / 0.3) ** 2) * (1 - ((v.co.y + 0.07) / 0.33) ** 2)
    obs.append(cushion)
    back = hbox("back", -0.42, 0.42, 0.35, 1.05, -0.42, -0.22, cloth, r=0.07, segments=4)
    for v in back.data.vertices:
        # Leaning back with its height, and rounded over the top.
        v.co.y += (v.co.z - 0.35) * 0.12
    obs.append(back)
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 0.42, sx * 0.29))
        obs.append(hbox(f"arm{sx}", x0, x1, 0.35, 0.62, -0.38, 0.38, cloth, r=0.035, segments=3))
        roll = sweep(f"roll{sx}", [(0.075 * math.cos(t / 14 * 2 * math.pi), 0.06 * math.sin(t / 14 * 2 * math.pi)) for t in range(14)], [H(sx * 0.37, 0.64, -0.38), H(sx * 0.37, 0.64, 0.42)], cloth, closed=True)
        roll["smooth"] = True
        obs.append(roll)
    for sx in (-1, 1):
        for sz in (-1, 1):
            obs.append(hturn(f"leg{sx}{sz}", [(0.0, 0.0), (0.018, 0.0), (0.022, 0.03), (0.028, 0.07), (0.03, 0.1), (0.0, 0.1)], "wood", sx * 0.36, 0, sz * 0.32, 12))
    for o in obs:
        wear(o, 0.003, 0.06, 11)
    return obs


def drape(name, collide, sheet, at, mat, frames=60):
    """Drops a cloth sheet (w, d) from `at` onto the objects in `collide` and
    lets it settle, as the chest's cloth is: Blender's cloth simulation."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=56, y_subdivisions=40, size=1)
    cloth = bpy.context.active_object
    cloth.name = name
    cloth.scale = (sheet[0], sheet[1], 1)
    cloth.location = at
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    cloth.data.materials.append(material(mat))
    for o in collide:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_add(type="COLLISION")
        o.collision.thickness_outer = 0.006
        o.collision.cloth_friction = 80
        o.collision.use_culling = False
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    floor = bpy.context.active_object
    bpy.ops.object.modifier_add(type="COLLISION")
    m = cloth.modifiers.new("cloth", "CLOTH")
    m.settings.quality = 8
    m.settings.mass = 0.25
    m.settings.tension_stiffness = 12
    m.settings.bending_stiffness = 0.8
    m.collision_settings.distance_min = 0.004
    m.collision_settings.friction = 40
    m.collision_settings.use_self_collision = False
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = frames
    for f in range(1, frames + 1):
        scene.frame_set(f)
    bpy.context.view_layer.objects.active = cloth
    bpy.ops.object.modifier_apply(modifier=m.name)
    apply(cloth, ("SOLIDIFY", {"thickness": 0.004}))
    cloth["smooth"] = True
    cloth["islands"] = True
    bpy.data.objects.remove(floor)
    for o in collide:
        o.modifiers.clear()
    return cloth


def tablecloth(p):
    """A cloth laid over a table of (w, d, h), dropped and let settle. The
    table under it is only something for it to fall on, and is not kept."""
    w, d, h = p["w"], p["d"], p["h"]
    top = hbox("top", -w / 2, w / 2, h - 0.035, h, -d / 2, d / 2, "wood", r=0.01)
    cloth = drape("cloth", [top], (w + 0.36, d + 0.36), (0, 0, h + 0.03), "curtain#d0d4bc", 80)
    bpy.data.objects.remove(top)
    return [cloth]


def setting(p):
    """One place laid at a table: a plate, and a glass beside it."""
    gx, gz = p["glass"]
    return [
        hturn("plate", [(0.0, 0.0), (0.08, 0.0), (0.1, 0.008), (0.12, 0.014), (0.118, 0.017), (0.0, 0.006)], "enamel", 0, 0, 0, 28),
        hturn("glass", [(0.0, 0.0), (0.03, 0.0), (0.03, 0.006), (0.006, 0.012), (0.005, 0.05), (0.03, 0.065), (0.034, 0.11), (0.0, 0.1)], "mirror#506058", gx, 0, gz, 16),
    ]


def candlestick(p):
    """A brass candlestick with a candle burned down in it."""
    return [
        hturn("stick", [(0.0, 0.0), (0.055, 0.0), (0.06, 0.01), (0.035, 0.03), (0.016, 0.05), (0.02, 0.12), (0.013, 0.18), (0.02, 0.22), (0.03, 0.23), (0.0, 0.235)], "brass", 0, 0, 0, 20),
        hturn("candle", [(0.0, 0.23), (0.012, 0.23), (0.012, 0.34), (0.009, 0.35), (0.0, 0.352)], "enamel", 0, 0, 0, 12),
    ]


def bucket(p):
    """A galvanised bucket with a wire handle."""
    b = hturn("bucket", [(0.0, 0.0), (0.11, 0.0), (0.115, 0.01), (0.13, 0.27), (0.136, 0.28), (0.128, 0.282), (0.12, 0.27), (0.105, 0.02), (0.0, 0.02)], "iron", 0, 0, 0, 24)
    handle = sweep("handle", [(0.004 * math.cos(t / 6 * 2 * math.pi), 0.004 * math.sin(t / 6 * 2 * math.pi)) for t in range(6)], [H(0.13 * math.cos(math.pi * t / 12), 0.26 + 0.12 * math.sin(math.pi * t / 12) * 0.9, 0.02 * math.sin(math.pi * t / 12)) for t in range(13)], "iron", closed=True)
    return [b, handle]


def coats(p):
    """Coats on a row of hooks: a rail on the wall, iron hooks, and three
    coats hung by their collars, falling in folds."""
    obs = [hbox("rail", -0.6, 0.6, 1.62, 1.72, 0, 0.025, "wood", r=0.008, segments=2)]
    for k, (x, col, ln) in enumerate(((-0.38, "8a9078", 1.0), (0.0, "a09070", 0.8), (0.38, "707a68", 1.1))):
        obs.append(hturn(f"hook{k}", [(0.0, 0.0), (0.008, 0.0), (0.008, 0.05), (0.014, 0.06), (0.0, 0.065)], "iron", x, 1.67, 0.025, 8, front=True))
        bm = bmesh.new()
        nx, ny = 16, 20
        grid = []
        for j in range(ny + 1):
            row = []
            v = j / ny
            y = 1.67 - ln * v
            half = 0.05 + 0.2 * min(1, v * 4) - 0.03 * v
            for i in range(nx + 1):
                u = i / nx
                xx = x + (u - 0.5) * 2 * half
                zz = 0.04 + 0.06 * min(1, v * 5) * math.sin(u * math.pi) + 0.015 * math.sin(u * 7 * math.pi + k) * v
                row.append(bm.verts.new(H(xx, y, zz)))
            grid.append(row)
        for j in range(ny):
            for i in range(nx):
                bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        coat = new_object(f"coat{k}", bm, f"curtain#{col}")
        apply(coat, ("SOLIDIFY", {"thickness": 0.02}))
        coat["smooth"] = True
        coat["islands"] = True
        obs.append(coat)
    return obs


def rocking_horse(p):
    """A rocking horse, painted: two bowed rockers joined by stretchers, four
    splayed legs, a full body, a neck and a head, and a saddle."""
    obs = []
    for sz in (-1, 1):
        path = [H(0.48 * math.sin(a), 0.92 - 0.9 * math.cos(a) + 0.02, sz * 0.12) for a in [-0.55 + 1.1 * t / 16 for t in range(17)]]
        r = sweep(f"rocker{sz}", [(-0.012, -0.03), (0.012, -0.03), (0.012, 0.03), (-0.012, 0.03)], path, "wood", closed=True)
        obs.append(r)
    for x in (-0.3, 0.3):
        obs.append(hbox(f"stretcher{x}", x - 0.02, x + 0.02, 0.04, 0.07, -0.13, 0.13, "wood", r=0.005))
    paint = "door#b8b098"
    for sx in (-1, 1):
        for sz in (-1, 1):
            obs.append(hsegment(f"leg{sx}{sz}", (sx * 0.3, 0.06), (sx * 0.2, 0.46), 0.04, sz * 0.09 - 0.02, sz * 0.09 + 0.02, paint, r=0.008))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=1)
    body = bpy.context.active_object
    body.name = "body"
    for v in body.data.vertices:
        v.co = Vector((v.co.x * 0.32, v.co.y * 0.11, v.co.z * 0.1))
    body.location = H(0, 0.52, 0)
    body.data.materials.append(material(paint))
    body["smooth"] = True
    body["islands"] = True
    obs.append(body)
    obs.append(hsegment("neck", (0.22, 0.52), (0.36, 0.82), 0.12, -0.05, 0.05, paint, r=0.03))
    obs.append(hsegment("head", (0.32, 0.8), (0.52, 0.76), 0.1, -0.045, 0.045, paint, r=0.03))
    obs.append(hsegment("mane", (0.2, 0.62), (0.32, 0.88), 0.03, -0.015, 0.015, "wood", r=0.006))
    obs.append(hbox("saddle", -0.12, 0.08, 0.59, 0.63, -0.115, 0.115, "leather", r=0.015, segments=2))
    for o in obs:
        wear(o, 0.0015, 0.05, 12)
    return obs


def towel_rail(p):
    """A brass towel rail on two wall brackets, a towel folded over it."""
    obs = []
    for x in (-0.3, 0.3):
        obs.append(hturn(f"bracket{x}", [(0.0, 0.0), (0.022, 0.0), (0.022, 0.006), (0.009, 0.012), (0.009, 0.06), (0.0, 0.06)], "brass", x, 1.21, 0.0, 12, front=True))
    rail = sweep("rail", [(0.009 * math.cos(t / 8 * 2 * math.pi), 0.009 * math.sin(t / 8 * 2 * math.pi)) for t in range(8)], [H(-0.31, 1.21, 0.06), H(0.31, 1.21, 0.06)], "brass", closed=True)
    rail["smooth"] = True
    obs.append(rail)
    bm = bmesh.new()
    nx, nv = 14, 24
    grid = []
    for j in range(nv + 1):
        v = j / nv
        # Down the back, round the rail, and down the front a little shorter.
        a = math.pi * v
        if v < 0.4:
            y, z = 0.8 + (1.21 - 0.8) * v / 0.4, 0.045
        elif v < 0.6:
            t = (v - 0.4) / 0.2 * math.pi
            y, z = 1.21 + 0.016 * math.sin(t), 0.06 - 0.016 * math.cos(t)
        else:
            y, z = 1.21 - (1.21 - 0.88) * (v - 0.6) / 0.4, 0.075 + 0.004 * math.sin(v * 20)
        row = [bm.verts.new(H(-0.22 + 0.44 * i / nx, y, z + 0.004 * math.sin(i * 1.3 + j))) for i in range(nx + 1)]
        grid.append(row)
    for j in range(nv):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    towel = new_object("towel", bm, "curtain#b8bca8")
    apply(towel, ("SOLIDIFY", {"thickness": 0.006}))
    towel["smooth"] = True
    towel["islands"] = True
    obs.append(towel)
    return obs


def toybox(p):
    """A painted toy box, back to the wall, without its lid: four boarded
    sides with corner battens, on a plinth, dark inside."""
    d = p["d"]
    paint = "door#9aa080"
    obs = [hbox("plinth", -0.37, 0.37, 0, 0.05, -0.01, d + 0.01, "wood", r=0.006)]
    t = 0.018
    obs.append(hbox("front", -0.35, 0.35, 0.05, 0.45, d - t, d, paint, r=0.004))
    obs.append(hbox("back", -0.35, 0.35, 0.05, 0.45, 0, t, paint, r=0.004))
    obs.append(hbox("side-l", -0.35, -0.35 + t, 0.05, 0.45, 0, d, paint, r=0.004))
    obs.append(hbox("side-r", 0.35 - t, 0.35, 0.05, 0.45, 0, d, paint, r=0.004))
    obs.append(hbox("inside", -0.35 + t, 0.35 - t, 0.05, 0.07, t, d - t, "black", r=0))
    for x in (-0.35, 0.35):
        for z in (0.0, d):
            obs.append(hbox(f"batten{x}{z}", x - 0.022, x + 0.022, 0.05, 0.45, z - 0.022, z + 0.022, "wood", r=0.006))
    for k in range(3):
        y = 0.12 + 0.12 * k
        obs.append(hbox(f"groove{k}", -0.33, 0.33, y - 0.002, y + 0.002, d, d + 0.002, "black", r=0))
    for o in obs:
        wear(o, 0.0012, 0.04, 13)
    return obs


def toybox_lid(p):
    """The toy box's lid, in its hinge's frame: from the hinge (z = 0) out to
    the front, with a moulded edge and a pull."""
    d = p["d"]
    obs = [hbox("lid", -0.37, 0.37, 0.0, 0.04, -0.01, d + 0.01, "door#8a9070", r=0.012, segments=3)]
    obs.append(hbox("rim", -0.36, 0.36, -0.015, 0.0, d - 0.01, d + 0.005, "door#8a9070", r=0.004))
    obs.append(knob("pull", 0, 0.0, d + 0.01))
    for x in (-0.25, 0.25):
        obs.append(hbox(f"hinge{x}", x - 0.03, x + 0.03, -0.02, 0.042, -0.012, 0.02, "iron", r=0.003))
    return obs


def longcase(p):
    """The dining room's long-case clock, in the clock's own frame (its face
    at z = 0.035, `face` high): a plinth, a trunk with a door, a hood with
    turned columns round the dial, a cornice and finials, and a dial with its
    hour marks. Its one hand is its own model."""
    fy = p["face"]
    obs = []
    obs.append(hbox("plinth", -0.275, 0.275, 0, 0.32, -0.27, 0.03, "wood", r=0.01, segments=2))
    obs.append(hbox("skirt", -0.29, 0.29, 0, 0.06, -0.285, 0.045, "wood", r=0.012, segments=3))
    obs.append(hbox("waist-mould", -0.27, 0.27, 0.32, 0.36, -0.27, 0.03, "wood", r=0.015, segments=3))
    obs.append(hbox("trunk", -0.21, 0.21, 0.36, fy - 0.28, -0.25, 0.0, "wood", r=0.006))
    obs += fielded("trunk-door", -0.15, 0.15, 0.45, fy - 0.36, 0.012, "wood", frame=0.035, raise_=0.01)
    obs.append(knob("trunk-key", 0.12, (0.45 + fy - 0.36) / 2, 0.012))
    obs.append(hbox("neck-mould", -0.25, 0.25, fy - 0.28, fy - 0.24, -0.27, 0.025, "wood", r=0.014, segments=3))
    obs.append(hbox("hood", -0.26, 0.26, fy - 0.24, fy + 0.26, -0.27, 0.0, "wood", r=0.006))
    obs.append(hbox("cornice", -0.29, 0.29, fy + 0.26, fy + 0.31, -0.29, 0.035, "wood", r=0.014, segments=3))
    obs.append(hbox("cap", -0.27, 0.27, fy + 0.31, fy + 0.35, -0.28, 0.02, "wood", r=0.01, segments=2))
    for x in (-0.2, 0.0, 0.2):
        obs.append(hturn(f"finial{x}", [(0.0, 0.0), (0.03, 0.0), (0.032, 0.012), (0.018, 0.03), (0.028, 0.05), (0.008, 0.08), (0.0, 0.09)], "brass", x, fy + 0.35, -0.12, 16))
    for x in (-0.235, 0.235):
        obs.append(hturn(f"column{x}", [(0.0, 0.0), (0.02, 0.0), (0.02, 0.02), (0.013, 0.03), (0.013, 0.44), (0.02, 0.45), (0.02, 0.47), (0.0, 0.47)], "brass", x, fy - 0.235, 0.012, 12))
    obs.append(hbox("dial-plate", -0.21, 0.21, fy - 0.21, fy + 0.21, 0.0, 0.03, "wood", r=0.004))
    obs.append(hturn("bezel", [(0.19, 0.0), (0.21, 0.0), (0.215, 0.008), (0.2, 0.014), (0.19, 0.01)], "brass", 0, fy, 0.03, 40, front=True, cap=False))
    me_face = lathe("dial", [(0.0, 0.0), (0.195, 0.0)], "paper", 40, cap=False)
    me_face.rotation_euler = (math.pi / 2, 0, 0)
    me_face.location = H(0, fy, 0.035)
    orient(me_face, (0, 1, 0), outward=True)
    obs.append(me_face)
    for k in range(12):
        a = math.pi / 2 - 2 * math.pi * k / 12
        r0, r1 = (0.15, 0.18) if k % 3 else (0.14, 0.18)
        obs.append(hsegment(f"mark{k}", (r0 * math.cos(a), fy + r0 * math.sin(a)), (r1 * math.cos(a), fy + r1 * math.sin(a)), 0.012 if k % 3 == 0 else 0.007, 0.035, 0.037, "black", r=0))
    for o in obs:
        wear(o, 0.001, 0.05, 14)
    return obs


def clock_hand(p):
    """The clock's hand, in its own frame: pointing up from its arbor, with a
    spade near the tip and a short tail, and a brass boss on the arbor."""
    blade = [(-0.004, -0.04), (0.004, -0.04), (0.003, 0.1), (0.014, 0.115), (0.0, 0.15), (-0.014, 0.115), (-0.003, 0.1)]
    bm = bmesh.new()
    a = [bm.verts.new(H(x, y, 0.0)) for x, y in blade]
    b = [bm.verts.new(H(x, y, 0.004)) for x, y in blade]
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for k in range(len(blade)):
        k2 = (k + 1) % len(blade)
        bm.faces.new((a[k], a[k2], b[k2], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return [new_object("hand", bm, "black"), hturn("boss", [(0.0, 0.0), (0.012, 0.0), (0.012, 0.006), (0.0, 0.008)], "brass", 0, 0, 0.004, 12, front=True)]


def shell(p):
    """The house's shell, as level.js lists it: every run of wall a block of
    plaster with its arrises rounded, as a plastered corner is, and every
    floor and ceiling a sheet facing the room."""
    obs = []
    for k, (mat, x0, x1, y0, y1, z0, z1) in enumerate(p["boxes"]):
        obs.append(hbox(f"wall{k}", x0, x1, y0, y1, z0, z1, mat, r=0.008, segments=2))
    for k, (mat, x0, x1, z0, z1, y, up) in enumerate(p["planes"]):
        me = bpy.data.meshes.new(f"plane{k}")
        quad = [H(x0, y, z0), H(x1, y, z0), H(x1, y, z1), H(x0, y, z1)]
        # Seen from above (a floor) or from below (a ceiling).
        me.from_pydata(quad, [], [(0, 3, 2, 1) if up > 0 else (0, 1, 2, 3)])
        ob = bpy.data.objects.new(f"plane{k}", me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(material(mat))
        obs.append(ob)
    return obs


def arch_fill(p):
    """The top corners of an arch, filled so the opening is round: the wall
    between the arch's square head and its curve, through the wall's
    thickness, its curved soffit with rounded arrises."""
    r, T = p["r"], p["T"]
    pts = [(-r, 0.0), (-r, r), (r, r), (r, 0.0)] + [(r * math.cos(math.pi * k / 16), r * math.sin(math.pi * k / 16)) for k in range(1, 16)]
    bm = bmesh.new()
    a = [bm.verts.new((x, -T / 2, y)) for x, y in pts]
    b = [bm.verts.new((x, T / 2, y)) for x, y in pts]
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    n = len(pts)
    for k in range(n):
        k2 = (k + 1) % n
        bm.faces.new((a[k], b[k], b[k2], a[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_object("arch", bm, "wall")
    bevel(ob, 0.008, 2)
    return [ob]


def note(p):
    """A sheet of paper, facing the room (+z) with its back at z = 0: on a
    wall it is pinned at its top corners and curls off the wall at the top,
    as the painting's notice does; on a table it lies with its corners lifted.
    Its texture is laid across the sheet as it would lie flat."""
    w, h = p["w"], p["h"]
    flat = p.get("flat", False)
    nx, ny = 14, 18
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x, y = (u - 0.5) * w, (v - 0.5) * h
            if flat:
                # Corners lifted, a little cockle across it.
                lift = 0.006 * (abs(2 * u - 1) * abs(2 * v - 1)) ** 2 + 0.0015 * math.sin(u * 7 + v * 3)
            else:
                # The top-left corner curls away from the wall, the rest lies on it.
                corner = max(0.0, 1 - math.hypot(u, 1 - v) / 0.45)
                top = max(0.0, (v - 0.82) / 0.18)
                lift = 0.035 * corner ** 2 + 0.006 * top + 0.0015 * math.sin(u * 9 + v * 5)
            row.append(bm.verts.new(H(x, y, 0.002 + max(0.0, lift))))
        grid.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for lo, (ii, jj) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lo[uvl].uv = (ii / nx, jj / ny)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    sheet = new_object("sheet", bm, "paper")
    apply(sheet, ("SOLIDIFY", {"thickness": 0.0008, "offset": -1}))
    sheet["smooth"] = True
    sheet["uvdone"] = True
    obs = [sheet]
    if not flat:
        for sx in (-1, 1):
            obs.append(hturn(f"pin{sx}", [(0.0, 0.0), (0.006, 0.0), (0.006, 0.003), (0.004, 0.005), (0.0, 0.006)], "brass", sx * (w / 2 - 0.025), h / 2 - 0.025, 0.004, 12, front=True))
    return obs


def sconce(p):
    """A wall lamp, its back on the wall (z = 0) facing the room: a turned
    back plate, a swan-neck arm, and a small frosted shade with the bulb lit
    behind it."""
    obs = [hturn("plate", [(0.0, 0.0), (0.05, 0.0), (0.052, 0.008), (0.04, 0.016), (0.0, 0.018)], "brass", 0, 0, 0.0, 20, front=True)]
    path = [H(0, 0.02 * math.sin(math.pi * t / 10) + 0.06 * (t / 10) ** 2, 0.015 + 0.13 * t / 10) for t in range(11)]
    arm = sweep("arm", [(0.006 * math.cos(k / 8 * 2 * math.pi), 0.006 * math.sin(k / 8 * 2 * math.pi)) for k in range(8)], path, "brass", closed=True)
    arm["smooth"] = True
    obs.append(arm)
    obs.append(hturn("cup", [(0.0, 0.05), (0.018, 0.05), (0.022, 0.07), (0.0, 0.075)], "brass", 0, 0, 0.145, 16))
    shade = lathe("shade", [(0.024, 0.07), (0.05, 0.1), (0.07, 0.15), (0.072, 0.16)], "lampshade", 24, cap=False)
    shade.location = H(0, 0, 0.145)
    shade["turned"] = True
    orient(shade, (0, 0, 0.12), outward=True)
    apply(shade, ("SOLIDIFY", {"thickness": 0.002}))
    obs.append(shade)
    obs.append(hturn("bulb", [(0.0, 0.07), (0.016, 0.075), (0.024, 0.1), (0.018, 0.125), (0.0, 0.13)], "shade", 0, 0, 0.145, 16))
    return obs


KIT = {
    "chest-carcass": chest_carcass,
    "drawer": drawer,
    "table": table,
    "bed": bed,
    "wardrobe": wardrobe,
    "bookcase": bookcase,
    "fireplace": fireplace,
    "range": range_,
    "dresser-base": dresser_base,
    "shelf": shelf,
    "bath": bath,
    "basin": basin,
    "pendant": pendant,
    "table-lamp": table_lamp,
    "dead-door": dead_door,
    "rug": rug,
    "armchair": armchair,
    "tablecloth": tablecloth,
    "setting": setting,
    "candlestick": candlestick,
    "bucket": bucket,
    "coats": coats,
    "rocking-horse": rocking_horse,
    "towel-rail": towel_rail,
    "toybox": toybox,
    "toybox-lid": toybox_lid,
    "longcase": longcase,
    "clock-hand": clock_hand,
    "shell": shell,
    "arch-fill": arch_fill,
    "note": note,
    "sconce": sconce,
}


# ---------------------------------------------------------------- the job

PIECES = {
    "cabinet": lambda p: cabinet("cabinet", *p["size"]),
    "chair": lambda p: chair("chair"),
    "chest": lambda p: chest_with_cloth("chest"),
    "vase": lambda p: vase("vase", p.get("scale", 1.0)),
    "clock": lambda p: clock("clock", p.get("radius", 0.1)),
    "lamp": lambda p: lamp("lamp", p.get("cord", 0.0)),
    "joist": lambda p: joist(p["id"], p["length"]),
    "bag": lambda p: bag("bag", p.get("tall", 1.0)),
    "newel": lambda p: newel("newel", p["height"], p.get("w", 0.13)),
    "flight": flight,
    "casing": casing,
    "skirting": skirting,
    "window": window,
    "picture": picture,
    "curtains": curtains,
    "handrail": handrail,
    "baluster": lambda p: baluster("baluster", p["height"]),
    "fixture": lambda p: fixture("fixture", p.get("scale", 1.0)),
    "rag": lambda p: rag("rag"),
}

PIECES.update(KIT)

for piece in JOB["pieces"]:
    reset()
    MATS.clear()
    kind = piece["kind"]
    if kind == "door":
        obs = door_leaf(piece["id"], piece["w"], piece["h"], glazed=piece.get("glazed", False), panes=tuple(piece.get("panes", (2, 2))), seed=piece.get("seed", 0), knob=piece.get("knob", 1))
    else:
        obs = PIECES[kind](piece)
    export(piece["id"], obs)
