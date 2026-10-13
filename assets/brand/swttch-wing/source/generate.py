"""Trace the approved WING reference and export font-independent SVG assets."""
from pathlib import Path
import math
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
COLORS = {"oxblood": "#570B27", "black": "#171717", "white": "#FFFFFF"}
BACKGROUND = "#F5F0E6"
reference = Image.open(ROOT / "source/wing-color-directions.png").convert("RGB")
pixels = reference.load()
mask = set()
for y in range(35, 320):
    for x in range(90, 450):
        r, g, b = pixels[x, y]
        if r > 40 and g < 55 and b < 90 and r > g * 1.6:
            mask.add((x, y))

components = []
remaining = set(mask)
while remaining:
    seed = remaining.pop()
    component, queue = {seed}, [seed]
    while queue:
        x, y = queue.pop()
        for neighbor in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if neighbor in remaining:
                remaining.remove(neighbor)
                component.add(neighbor)
                queue.append(neighbor)
    if len(component) > 100:
        components.append(component)
assert len(components) == 2, "Expected the two original leaves"
components.sort(key=len, reverse=True)
min_x, min_y = min(x for x,y in mask), min(y for x,y in mask)
width = max(x for x,y in mask) - min_x + 1
height = max(y for x,y in mask) - min_y + 1

def simplify(points, tolerance=2.4):
    if len(points) < 3:
        return points
    ax, ay = points[0]; bx, by = points[-1]
    distances = [abs((bx-ax)*(ay-y)-(ax-x)*(by-ay))/max(math.hypot(bx-ax,by-ay),1e-9) for x,y in points]
    index = max(range(len(points)), key=distances.__getitem__)
    if distances[index] > tolerance:
        return simplify(points[:index+1],tolerance)[:-1] + simplify(points[index:],tolerance)
    return [points[0],points[-1]]

def trace(component):
    edges = {}
    for x,y in component:
        if (x,y-1) not in component: edges[(x,y)] = (x+1,y)
        if (x+1,y) not in component: edges[(x+1,y)] = (x+1,y+1)
        if (x,y+1) not in component: edges[(x+1,y+1)] = (x,y+1)
        if (x-1,y) not in component: edges[(x,y+1)] = (x,y)
    start = min(edges)
    points = [start]; current = edges[start]
    while current != start:
        points.append(current); current = edges[current]
    opposite = max(range(len(points)),key=lambda i: math.dist(points[i],start))
    points = simplify(points[:opposite+1])[:-1] + simplify(points[opposite:]+[start])[:-1]
    points = [(x-min_x,y-min_y) for x,y in points]
    # Smooth the raster stair steps while retaining the sharp leaf tips.
    tangents=[]
    for i,p in enumerate(points):
        before, after = points[i-1],points[(i+1)%len(points)]
        u=(before[0]-p[0],before[1]-p[1]);v=(after[0]-p[0],after[1]-p[1])
        cosine=(u[0]*v[0]+u[1]*v[1])/max(math.hypot(*u)*math.hypot(*v),1e-9)
        tangents.append((0,0) if cosine > 0.1 else ((after[0]-before[0])/6,(after[1]-before[1])/6))
    commands=[f"M{points[0][0]:.2f},{points[0][1]:.2f}"]
    for i,p in enumerate(points):
        j=(i+1)%len(points);q=points[j];t=tangents[i];s=tangents[j]
        commands.append(f"C{p[0]+t[0]:.2f},{p[1]+t[1]:.2f} {q[0]-s[0]:.2f},{q[1]-s[1]:.2f} {q[0]:.2f},{q[1]:.2f}")
    return " ".join(commands)+" Z"

PATHS=[trace(c) for c in components]
font = instantiateVariableFont(TTFont(ROOT / "source/Manrope.ttf"), {"wght":300})
glyphs=font.getGlyphSet(); cmap=font.getBestCmap(); units=font["head"].unitsPerEm
letters=[]; cursor=0; font_size=92
for character in "swttch":
    name=cmap[ord(character)];pen=SVGPathPen(glyphs);glyphs[name].draw(pen)
    letters.append(f'<path d="{pen.getCommands()}" transform="translate({cursor:.3f} 0)"/>')
    cursor += font["hmtx"].metrics[name][0] + 0.10*units
text_width=(cursor-0.10*units)*font_size/units

def symbol(color):
    return "".join(f'<path fill="{color}" d="{p}"/>' for p in PATHS)

def save(folder,name,w,h,body):
    path=ROOT/folder/(name+".svg");path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="Swttch"><title>Swttch WING</title>{body}</svg>\n')

for name,color in COLORS.items():
    save("symbol",f"swttch-symbol-{name}",width+4,height+4,f'<g transform="translate(2 2)">{symbol(color)}</g>')
    # Same geometry for small usage: less canvas padding and dedicated exports.
    save("small",f"swttch-small-{name}",width+4,height+4,f'<g transform="translate(2 2)">{symbol(color)}</g>')
    mark_scale=0.43; mark_width=width*mark_scale
    horizontal_width=math.ceil(32+mark_width+40+text_width+32)
    body=f'<g transform="translate(32 {(176-height*mark_scale)/2:.3f}) scale({mark_scale})">{symbol(color)}</g>'
    body+=f'<g fill="{color}" transform="translate({32+mark_width+40:.3f} 118) scale({font_size/units:.6f} {-font_size/units:.6f})">'+"".join(letters)+"</g>"
    save("horizontal",f"swttch-horizontal-{name}",horizontal_width,176,body)
for name,background,foreground in [("cream",BACKGROUND,COLORS["oxblood"]),("oxblood",COLORS["oxblood"],COLORS["white"])]:
    scale=360/width
    body=f'<rect width="512" height="512" fill="{background}"/><g transform="translate({(512-width*scale)/2:.3f} {(512-height*scale)/2:.3f}) scale({scale:.6f})">{symbol(foreground)}</g>'
    save("avatar",f"swttch-avatar-{name}",512,512,body)
save("source","wing-paths",width+4,height+4,f'<g transform="translate(2 2)">{symbol(COLORS["oxblood"])}</g>')
print(f"Created 11 SVG variants; mark bounds {width} × {height}")
