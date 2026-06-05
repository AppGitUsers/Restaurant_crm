"""
Bill PDF generator using ReportLab.
Teal + Gold theme matching the frontend.
"""
import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

TEAL  = colors.HexColor('#1D9E75')
GOLD  = colors.HexColor('#BA7517')
LIGHT = colors.HexColor('#E1F5EE')
WHITE = colors.white
DARK  = colors.HexColor('#1a1a1a')
GRAY  = colors.HexColor('#666666')


def generate_bill_pdf(order) -> bytes:
    buffer = io.BytesIO()
    doc    = SimpleDocTemplate(buffer, pagesize=A4,
                                rightMargin=15*mm, leftMargin=15*mm,
                                topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()
    story  = []

    title_style = ParagraphStyle('Title', parent=styles['Normal'],
                                  fontSize=22, textColor=TEAL, alignment=TA_CENTER,
                                  fontName='Helvetica-Bold', spaceAfter=2)
    sub_style   = ParagraphStyle('Sub', parent=styles['Normal'],
                                  fontSize=10, textColor=GRAY, alignment=TA_CENTER)
    label_style = ParagraphStyle('Label', parent=styles['Normal'],
                                  fontSize=9, textColor=GRAY)
    value_style = ParagraphStyle('Value', parent=styles['Normal'],
                                  fontSize=10, textColor=DARK, fontName='Helvetica-Bold')
    right_style = ParagraphStyle('Right', parent=styles['Normal'],
                                  fontSize=10, alignment=TA_RIGHT, textColor=DARK)

    # Header
    story.append(Paragraph("🍽 Restaurant", title_style))
    story.append(Paragraph("Tax Invoice / Bill", sub_style))
    story.append(Spacer(1, 6*mm))

    # Bill meta info table
    meta = [
        [Paragraph("Bill No", label_style),   Paragraph(f": {order.order_number}", value_style),
         Paragraph("Date", label_style),       Paragraph(f": {order.created_at.strftime('%d %b %Y %I:%M %p')}", value_style)],
        [Paragraph("Customer", label_style),   Paragraph(f": {order.customer_name or 'Walk-in'}", value_style),
         Paragraph("Phone", label_style),      Paragraph(f": {order.customer_phone or '—'}", value_style)],
        [Paragraph("Payment", label_style),    Paragraph(f": {order.payment_method}", value_style),
         Paragraph("Biller", label_style),     Paragraph(f": {order.biller.username if order.biller else '—'}", value_style)],
    ]
    meta_table = Table(meta, colWidths=[25*mm, 65*mm, 25*mm, 65*mm])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT),
        ('BOX',        (0, 0), (-1, -1), 0.5, TEAL),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [LIGHT, WHITE]),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (-1, -1), 4),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 5*mm))

    # Items table
    header = ['#', 'Item', 'Type', 'Qty', 'Rate (₹)', 'Total (₹)']
    rows   = [header]
    for i, item in enumerate(order.items.select_related('food_item__food_type').all(), 1):
        rows.append([
            str(i),
            item.food_item.name,
            item.food_item.food_type.name,
            str(item.quantity),
            f"{item.unit_price:.2f}",
            f"{item.line_total:.2f}",
        ])

    items_table = Table(rows, colWidths=[10*mm, 65*mm, 35*mm, 15*mm, 25*mm, 30*mm])
    items_table.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, 0), TEAL),
        ('TEXTCOLOR',     (0, 0), (-1, 0), WHITE),
        ('FONTNAME',      (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, -1), 9),
        ('ALIGN',         (3, 0), (-1, -1), 'RIGHT'),
        ('ALIGN',         (0, 0), (0, -1), 'CENTER'),
        ('ROWBACKGROUNDS',(0, 1), (-1, -1), [WHITE, LIGHT]),
        ('BOX',           (0, 0), (-1, -1), 0.5, TEAL),
        ('INNERGRID',     (0, 0), (-1, -1), 0.25, colors.HexColor('#CCCCCC')),
        ('TOPPADDING',    (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING',   (0, 0), (-1, -1), 6),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 4*mm))

    # Totals
    totals_data = [
        ['', 'Subtotal',        f"₹ {order.subtotal:.2f}"],
        ['', f'Discount',        f"- ₹ {order.discount:.2f}"],
        ['', f'Tax ({order.tax_percent}%)', f"₹ {order.tax_amount:.2f}"],
        ['', 'TOTAL',           f"₹ {order.total_amount:.2f}"],
    ]
    totals_table = Table(totals_data, colWidths=[100*mm, 40*mm, 40*mm])
    totals_table.setStyle(TableStyle([
        ('ALIGN',      (1, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME',   (1, 3), (-1, 3), 'Helvetica-Bold'),
        ('FONTSIZE',   (1, 3), (-1, 3), 12),
        ('FONTSIZE',   (0, 0), (-1, -1), 9),
        ('BACKGROUND', (1, 3), (-1, 3), TEAL),
        ('TEXTCOLOR',  (1, 3), (-1, 3), WHITE),
        ('LINEABOVE',  (1, 3), (-1, 3), 0.5, GOLD),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 8*mm))

    # Footer
    footer = Paragraph("Thank you for dining with us! ✨", sub_style)
    story.append(footer)

    doc.build(story)
    return buffer.getvalue()
