import io
from django.core.files.uploadedfile import InMemoryUploadedFile
from PIL import Image, ExifTags


def compress_image(upload, max_width, max_height, quality=80):
    """
    Resize and compress an uploaded image file in memory.
    Returns an InMemoryUploadedFile ready to be saved by Django.
    Converts all formats to JPEG. Preserves orientation from EXIF data.
    """
    img = Image.open(upload)

    # Fix rotation from EXIF (phone cameras embed orientation metadata)
    try:
        exif = img._getexif()
        if exif:
            orientation_key = next(
                k for k, v in ExifTags.TAGS.items() if v == 'Orientation'
            )
            orientation = exif.get(orientation_key)
            rotation_map = {3: 180, 6: 270, 8: 90}
            if orientation in rotation_map:
                img = img.rotate(rotation_map[orientation], expand=True)
    except Exception:
        pass

    # Convert to RGB (required for JPEG — removes alpha channel from PNG/WEBP)
    if img.mode != 'RGB':
        img = img.convert('RGB')

    # Resize only if larger than the max dimensions (never upscale)
    img.thumbnail((max_width, max_height), Image.LANCZOS)

    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=quality, optimize=True)
    buffer.seek(0)

    original_name = getattr(upload, 'name', 'photo.jpg')
    filename = original_name.rsplit('.', 1)[0] + '.jpg'

    return InMemoryUploadedFile(
        file=buffer,
        field_name=None,
        name=filename,
        content_type='image/jpeg',
        size=buffer.getbuffer().nbytes,
        charset=None,
    )
