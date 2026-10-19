"""
generate_mockups.py — documentation-only SVG mockups for the clinical notation
decisions in docs/PEDITREE_CLINICAL_NOTATION_SPEC_V1.md (§ Onay gerektiren
kararlar). NOT production rendering: every panel is a hand-drawn sketch for a
clinician to compare options. Run:  python3 docs/notation/generate_mockups.py
Writes docs/notation/mockups/*.svg.
"""
import os

OUT = os.path.join(os.path.dirname(__file__), 'mockups')
INK, LINE, MUTED, WARN = '#1e293b', '#64748b', '#475569', '#b91c1c'
S = 20  # half symbol size (renderer: 40 px symbols)


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="system-ui, sans-serif">\n<rect width="{w}" height="{h}" fill="#fff"/>\n'
            f'<text x="12" y="20" font-size="13" font-weight="700" fill="{INK}">{title}</text>\n'
            f'<text x="{w - 12}" y="20" font-size="11" fill="{WARN}" text-anchor="end">taslak — klinik onay bekliyor, üretimde değil</text>\n'
            f'{body}\n</svg>\n')


def caption(x, y, lines, color=MUTED):
    return ''.join(f'<text x="{x}" y="{y + 14 * i}" font-size="11" fill="{color}" text-anchor="middle">{t}</text>' for i, t in enumerate(lines))


def line(x1, y1, x2, y2, dash=False, w=1.5, color=LINE):
    d = ' stroke-dasharray="6 4"' if dash else ''
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{w}"{d}/>'


def square(x, y, fill='#fff', s=S):
    return f'<rect x="{x - s}" y="{y - s}" width="{2 * s}" height="{2 * s}" fill="{fill}" stroke="{INK}" stroke-width="2"/>'


def circle(x, y, fill='#fff', s=S):
    return f'<circle cx="{x}" cy="{y}" r="{s}" fill="{fill}" stroke="{INK}" stroke-width="2"/>'


def diamond(x, y, fill='#fff', s=S):
    return f'<path d="M{x},{y - s} L{x + s},{y} L{x},{y + s} L{x - s},{y} Z" fill="{fill}" stroke="{INK}" stroke-width="2"/>'


def triangle(x, y, s=14, fill='#fff'):
    return f'<path d="M{x},{y - s} L{x + s},{y + s} L{x - s},{y + s} Z" fill="{fill}" stroke="{INK}" stroke-width="2"/>'


def num(x, y, t, anchor='middle'):
    return f'<text x="{x}" y="{y}" font-size="10" fill="{LINE}" text-anchor="{anchor}">{t}</text>'


def brackets(x, y, s=S + 7):
    return (f'<path d="M{x - s + 6},{y - s} L{x - s},{y - s} L{x - s},{y + s} L{x - s + 6},{y + s}" fill="none" stroke="{INK}" stroke-width="2"/>'
            f'<path d="M{x + s - 6},{y - s} L{x + s},{y - s} L{x + s},{y + s} L{x + s - 6},{y + s}" fill="none" stroke="{INK}" stroke-width="2"/>')


def arrow(x, y, p=False):
    o = S + 6
    a = (f'<path d="M{x - o - 14},{y + o + 14} L{x - o},{y + o} M{x - o},{y + o} L{x - o - 10},{y + o} '
         f'M{x - o},{y + o} L{x - o},{y + o + 10}" fill="none" stroke="{INK}" stroke-width="2"/>')
    if p:
        a += f'<text x="{x - o - 22}" y="{y + o + 26}" font-size="12" font-weight="700" fill="{INK}">P</text>'
    return a


def write(name, content):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(content)


# 1 — pedigree number placement
def label_placement():
    body, y = '', 110
    panels = [
        ('A — mevcut', ['numara sembolün üstünde ortada;', 'iniş çizgisi içinden geçiyor'], (0, -(S + 8), 'middle')),
        ('B — sol üst', ['numara çizginin solunda,', 'sembolün sol üst köşesinde'], (-S - 3, -S - 4, 'end')),
        ('C — sağ üst', ['numara çizginin sağında,', 'sembolün sağ üst köşesinde'], (S + 3, -S - 4, 'start')),
        ('D — sembolün altı', ['numara yaşın üstünde,', 'çizgiden uzakta'], (0, S + 14, 'middle')),
    ]
    for i, (title, cap, (dx, dy, anchor)) in enumerate(panels):
        x = 110 + i * 200
        body += line(x, 50, x, y - S) + square(x, y) + num(x + dx, y + dy, 'III-3', anchor)
        if title.startswith('D'):
            body += f'<text x="{x}" y="{y + S + 28}" font-size="11" fill="{MUTED}" text-anchor="middle">5</text>'
        else:
            body += f'<text x="{x}" y="{y + S + 14}" font-size="11" fill="{MUTED}" text-anchor="middle">5</text>'
        body += caption(x, 190, [title] + cap, INK if i == 0 else MUTED)
    write('01-pedigree-number-placement.svg', svg(820, 240, body, 'Pedigri numarasının yeri (iniş çizgisiyle çakışma)'))


# 2 — adoption
def adoption():
    body = ''
    # A current
    x = 110
    body += line(x - 40, 60, x + 40, 60) + line(x, 60, x, 90, dash=True) + square(x, 110, INK) + num(x, 82, 'III-3')
    body += caption(x, 170, ['A — mevcut (CB-07)', 'kesikli iniş var,', 'köşeli parantez yok'], INK)
    # B adopted in
    x = 310
    body += line(x - 40, 60, x + 40, 60) + line(x, 60, x, 83, dash=True) + square(x, 110, INK) + brackets(x, 110) + num(x - 30, 78, 'III-3', 'end')
    body += caption(x, 170, ['B — evlat edinilmiş (içeri):', 'köşeli parantez + kesikli çizgi', 'evlat edinen ebeveynlerden'])
    # C adopted out
    x = 510
    body += line(x - 40, 60, x + 40, 60) + line(x, 60, x, 83) + square(x, 110) + brackets(x, 110) + num(x - 30, 78, 'II-2', 'end')
    body += caption(x, 170, ['C — evlat verilmiş (dışarı):', 'köşeli parantez + düz çizgi', 'biyolojik ebeveynlerden'])
    # D both families
    x = 710
    body += line(x - 70, 50, x - 10, 50) + line(x - 40, 50, x - 40, 70) + line(x - 40, 70, x - 8, 70) + line(x - 8, 70, x - 8, 83)
    body += line(x + 10, 40, x + 70, 40) + line(x + 40, 40, x + 40, 64, dash=True) + line(x + 40, 64, x + 8, 64, dash=True) + line(x + 8, 64, x + 8, 83, dash=True)
    body += square(x, 110) + brackets(x, 110)
    body += caption(x, 170, ['D — biyolojik ve evlat edinen aile', 'birlikte: iki ebeveyn çiftine bağlı', '(model değişikliği gerektirir)'], WARN)
    write('02-adoption.svg', svg(820, 230, body, 'Evlat edinme gösterimi'))


# 3 — carrier and multiple conditions
def carrier():
    body = ''
    halfpat = ('<defs><pattern id="h" width="1" height="1" patternContentUnits="objectBoundingBox">'
               f'<rect width="0.5" height="1" fill="{INK}"/><rect x="0.5" width="0.5" height="1" fill="#fff"/></pattern>'
               '<pattern id="q" width="1" height="1" patternContentUnits="objectBoundingBox">'
               f'<rect width="0.5" height="0.5" fill="{INK}"/><rect x="0.5" y="0.5" width="0.5" height="0.5" fill="#94a3b8"/></pattern></defs>')
    body += halfpat
    x = 100
    body += circle(x, 90, 'url(#h)') + caption(x, 140, ['A — mevcut', 'yarım dolgu = "taşıyıcı"'], INK)
    x = 260
    body += circle(x, 90) + f'<circle cx="{x}" cy="90" r="4" fill="{INK}"/>' + caption(x, 140, ['B — ortada nokta', 'taşıyıcı (hastalık beklenmez)'])
    x = 420
    body += circle(x, 90) + line(x, 70, x, 110, w=2, color=INK) + caption(x, 140, ['C — dikey çizgi', 'asemptomatik / presemptomatik'])
    x = 580
    body += circle(x, 90, 'url(#h)') + caption(x, 140, ['D — yarım dolgu', 'bazı özetlerde presemptomatik;', 'kaynaklar çelişiyor'], WARN)
    x = 740
    body += square(x, 90, 'url(#q)') + caption(x, 140, ['E — bölmeli dolgu', 'birden fazla fenotip', '(lejant zorunlu)'])
    write('03-carrier-phenotypes.svg', svg(840, 210, body, 'Taşıyıcılık ve çoklu fenotip'))


# 4 — pregnancy outcomes
def pregnancy():
    body = ''
    x = 90
    body += triangle(x, 90) + caption(x, 135, ['SAB (düşük)', 'mevcut: üçgen ✓'])
    x = 240
    body += triangle(x, 90) + line(x - 18, 108, x + 18, 72, w=2, color=INK) + caption(x, 135, ['TOP (sonlandırma)', 'üçgen + çapraz çizgi', 'modelde yok'], WARN)
    x = 390
    body += diamond(x, 90, s=14) + line(x - 14, 76, x + 14, 104, w=2, color=INK) + line(x - 14, 104, x + 14, 76, w=2, color=INK)
    body += caption(x, 135, ['Ölü doğum — mevcut', 'küçük sembol + X'], INK)
    x = 560
    body += diamond(x, 90) + line(x - 26, 64, x + 26, 116, w=2, color=INK) + f'<text x="{x}" y="132" font-size="11" fill="{INK}" text-anchor="middle">SB 28 hf</text>'
    body += caption(x, 150, ['Ölü doğum — NSGC', 'tam sembol + çapraz çizgi', '+ "SB" ve gebelik haftası'])
    x = 730
    body += line(x - 12, 100, x + 4, 76, w=2, color=INK) + line(x - 4, 104, x + 12, 80, w=2, color=INK) + f'<text x="{x}" y="122" font-size="11" fill="{INK}" text-anchor="middle">ECT</text>'
    body += caption(x, 150, ['Ektopik gebelik', 'modelde yok'], WARN)
    write('04-pregnancy-outcomes.svg', svg(840, 210, body, 'Gebelik sonuçları'))


# 5 — proband / consultand
def proband():
    body = ''
    x = 140
    body += square(x, 90, INK) + arrow(x, 90) + caption(x, 160, ['A — mevcut proband', 'ok, "P" yok'], INK)
    x = 420
    body += square(x, 90, INK) + arrow(x, 90, p=True) + caption(x, 160, ['B — NSGC proband', 'ok + "P"'])
    x = 700
    body += circle(x, 90) + arrow(x, 90) + caption(x, 160, ['C — NSGC danışan (consultand)', 'yalnız ok; modelde ayrı alan yok'], WARN)
    write('05-proband-consultand.svg', svg(840, 210, body, 'Proband ve danışan'))


# 6 — twins
def twins():
    body = ''
    for i, (title, bar, q) in enumerate([('Monozigotik', True, False), ('Dizigotik', False, False), ('Zigositesi bilinmeyen', False, True)]):
        x = 140 + i * 280
        body += line(x - 80, 50, x + 80, 50) + line(x, 50, x, 64) + line(x, 64, x - 40, 100) + line(x, 64, x + 40, 100)
        body += square(x - 40, 120) + square(x + 40, 120)
        if bar:
            body += line(x - 20, 82, x + 20, 82)
        if q:
            body += f'<text x="{x}" y="96" font-size="12" font-weight="700" fill="{INK}" text-anchor="middle">?</text>'
        body += caption(x, 170, [title])
    body += caption(420, 196, ['İkiz gösterimi modelde ve çizicide yok'], WARN)
    write('06-twins.svg', svg(840, 210, body, 'İkizler'))


# 7 — consanguinity routing when known birth order separates the couple
def consanguinity():
    body = ''
    # A current lane
    def fam(x0, labels):
        out = ''
        for k, (sex, lab) in enumerate(labels):
            x = x0 + k * 60
            out += (square(x, 140, s=14) if sex == 'm' else circle(x, 140, s=14))
            out += f'<text x="{x}" y="168" font-size="11" fill="{MUTED}" text-anchor="middle">{lab}</text>'
        return out
    body += line(40, 70, 160, 70) + line(100, 70, 100, 85) + line(60, 85, 140, 85) + line(60, 85, 60, 126) + line(140, 85, 140, 126)
    body += fam(60, [('m', '44'), ('m', '41')])
    body += line(220, 70, 340, 70) + line(280, 70, 280, 85) + line(220, 85, 320, 85) + line(220, 85, 220, 126) + line(320, 85, 320, 126)
    body += fam(200, [('m', 'eş'), ('f', '39'), ('f', '37')])
    body += f'<path d="M154,140 L162,140 L162,104 L322,104 L322,126" fill="none" stroke="{LINE}" stroke-width="1.5"/>'
    body += f'<path d="M158,144 L166,144 L166,108 L318,108 L318,126" fill="none" stroke="{LINE}" stroke-width="1.5"/>'
    body += caption(190, 196, ['A — mevcut: doğum sırası korunur;', 'çift çizgi şeritle teyze ailesinin üstünden geçer'], INK)
    # B adjacent (birth order relaxed)
    x0 = 470
    body += line(x0, 70, x0 + 120, 70) + line(x0 + 60, 70, x0 + 60, 85) + line(x0 + 20, 85, x0 + 100, 85) + line(x0 + 20, 85, x0 + 20, 126) + line(x0 + 100, 85, x0 + 100, 126)
    body += fam(x0 + 20, [('m', '44'), ('m', '41')])
    body += line(x0 + 160, 70, x0 + 280, 70) + line(x0 + 220, 70, x0 + 220, 85) + line(x0 + 120, 85, x0 + 260, 85) + line(x0 + 120, 85, x0 + 120, 126) + line(x0 + 260, 85, x0 + 260, 126)
    body += fam(x0 + 120, [('f', '37'), ('m', 'eş'), ('f', '39')])
    body += line(x0 + 114, 138, x0 + 106, 138) + line(x0 + 114, 142, x0 + 106, 142)
    body += caption(x0 + 140, 196, ['B — eşler bitişik: annenin kardeşliğinde', 'doğum sırası görsel olarak ters (37 yaş solda)'], WARN)
    write('07-consanguinity-routing.svg', svg(840, 230, body, 'Akraba evliliğinde eşler bilinen doğum sırasıyla ayrı düştüğünde'))


# 8 — step / social parenthood
def social():
    body = ''
    x = 140
    body += line(x - 60, 60, x + 60, 60) + line(x, 60, x, 100, dash=True) + square(x, 120)
    body += caption(x, 170, ['A — mevcut: yalnız sosyal bağı olan', 'her çocuk (evlat edinme, koruyucu aile,', 'üvey, vasi) kesikli çizgiyle'], INK)
    x = 420
    body += line(x - 70, 60, x - 10, 60) + line(x - 40, 60, x - 40, 100) + square(x - 40, 120) + line(x + 10, 60, x + 70, 60)
    body += f'<text x="{x - 40}" y="152" font-size="10" fill="{MUTED}" text-anchor="middle">üvey baba: ilişki çizgisi</text>'
    body += caption(x, 180, ['B — üvey ilişki yalnız partnerlik', 'çizgisiyle; ebeveyn çizgisi çizilmez'])
    x = 700
    body += line(x - 60, 60, x + 60, 60) + line(x, 60, x, 100, dash=True) + square(x, 120) + f'<text x="{x + 26}" y="124" font-size="10" fill="{MUTED}">koruyucu</text>'
    body += caption(x, 170, ['C — kesikli çizgi + tür etiketi', '(NSGC\'de ayrı sembol yok)'], WARN)
    write('08-step-social.svg', svg(840, 210, body, 'Üvey ve sosyal ebeveynlik'))


# 9 — deceased slash on an affected (filled) symbol
def deceased():
    body = ''
    x = 200
    body += square(x, 90, INK) + line(x - 24, 66, x + 24, 114, w=2, color=INK) + caption(x, 145, ['A — mevcut: koyu çizgi koyu dolgu', 'üstünde yalnız köşelerde görünür'], INK)
    x = 560
    body += square(x, 90, INK) + line(x - 30, 60, x + 30, 120, w=2, color=INK) + line(x - 17, 73, x + 17, 107, w=2, color='#fff')
    body += caption(x, 145, ['B — sembol içinde açık renk çizgi', '(görünürlük; anlam aynı)'])
    write('09-deceased-affected.svg', svg(760, 190, body, 'Vefat etmiş ve etkilenmiş birey'))


for fn in (label_placement, adoption, carrier, pregnancy, proband, twins, consanguinity, social, deceased):
    fn()
print('mockups written to', OUT)
