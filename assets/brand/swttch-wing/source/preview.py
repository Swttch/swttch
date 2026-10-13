from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
canvas = Image.new("RGB", (1200, 1050), "#F5F0E6")
draw = ImageDraw.Draw(canvas)
# Preview labels only; every exported logo's lettering is outlined in its SVG.
font_path = "/System/Library/Fonts/Avenir Next.ttc"
heading = ImageFont.truetype(font_path, 34)
label = ImageFont.truetype(font_path, 19)
small = ImageFont.truetype(font_path, 15)

def place(file, box):
    im = Image.open(file).convert("RGBA")
    im.thumbnail((box[2], box[3]), Image.Resampling.LANCZOS)
    canvas.paste(im, (int(box[0] + (box[2] - im.width) / 2),
                      int(box[1] + (box[3] - im.height) / 2)), im)

draw.text((48,35), "SWTTCH / WING", font=heading, fill="#570B27")
draw.text((48,84), "Flat identity assets  ·  12 October 2026", font=label, fill="#570B27")
for i, (name, title, background) in enumerate([
    ("oxblood", "Oxblood", None), ("black", "Black", None),
    ("white", "White / reverse", "#570B27")
]):
    x = 48 + i * 368
    if background:
        draw.rectangle((x,140,x+336,360), fill=background)
    place(root / "symbol" / f"swttch-symbol-{name}-1024.png", (x+34,155,268,190))
    draw.text((x,380), title, font=label, fill="#570B27")
draw.line((48,427,1152,427), fill="#D9C8BE", width=1)
draw.text((48,457), "Horizontal lockup", font=label, fill="#570B27")
place(root / "horizontal/swttch-horizontal-oxblood-1024.png", (40,505,710,205))
for i, name in enumerate(["cream", "oxblood"]):
    place(root / "avatar" / f"swttch-avatar-{name}-512.png", (810+i*175,505,155,155))
    draw.text((810+i*175,677), name, font=small, fill="#570B27")
draw.line((48,746,1152,746), fill="#D9C8BE", width=1)
draw.text((48,776), "Small symbols / native export sizes", font=label, fill="#570B27")
for i, width in enumerate([16,24,32,48,64]):
    im = Image.open(root / "small" / f"swttch-small-oxblood-{width}.png").convert("RGBA")
    x = 65 + i * 145
    canvas.paste(im, (x,850+(64-im.height)//2), im)
    draw.text((x,942), f"{width} px", font=small, fill="#570B27")
draw.text((810,848), "Oxblood  #570B27", font=label, fill="#570B27")
draw.text((810,880), "Cream    #F5F0E6", font=label, fill="#570B27")
canvas.save(root / "preview.png")
