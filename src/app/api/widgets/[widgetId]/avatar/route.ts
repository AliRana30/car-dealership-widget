import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { getWidget } from '@/config/widgetsDb';

// Configure Cloudinary — server-side only, never exposed to client
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

type RouteContext = {
  params: Promise<{ widgetId: string }> | { widgetId: string };
};

function missingCloudinaryConfig() {
  return (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  );
}

// POST /api/widgets/[widgetId]/avatar — Upload a new avatar image
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    if (missingCloudinaryConfig()) {
      return NextResponse.json(
        { error: 'server_config', message: 'Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to your environment variables.' },
        { status: 503 }
      );
    }

    const resolvedParams = await context.params;
    const { widgetId } = resolvedParams;

    if (!widgetId) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing widget ID' }, { status: 400 });
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'bad_request', message: 'Request must be multipart/form-data' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'bad_request', message: 'No file provided. Include a "file" field in the form data.' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'invalid_file_type', message: `File type "${file.type}" is not allowed. Accepted types: JPEG, PNG, GIF, WebP.` },
        { status: 422 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return NextResponse.json(
        { error: 'file_too_large', message: `File size ${sizeMB} MB exceeds the 5 MB limit. Please compress or resize the image.` },
        { status: 422 }
      );
    }

    // Convert File to Buffer for Cloudinary upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Cloudinary
    const uploadResult = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'front-desk-avatars',
          resource_type: 'image',
          transformation: [
            { width: 256, height: 256, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
          overwrite: false,
        },
        (error, result) => {
          if (error || !result) {
            reject(new Error(error?.message || 'Cloudinary upload failed'));
          } else {
            resolve({ secure_url: result.secure_url, public_id: result.public_id });
          }
        }
      );
      uploadStream.end(buffer);
    });

    return NextResponse.json(
      { secure_url: uploadResult.secure_url, public_id: uploadResult.public_id },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[api/widgets/avatar] POST failed:', error);
    // Specific Cloudinary error message when possible
    const message = error?.http_code
      ? `Cloudinary error (${error.http_code}): ${error.message}`
      : error?.message || 'Failed to upload avatar';
    return NextResponse.json({ error: 'upload_failed', message }, { status: 500 });
  }
}

// DELETE /api/widgets/[widgetId]/avatar — Delete an existing avatar from Cloudinary
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    if (missingCloudinaryConfig()) {
      return NextResponse.json(
        { error: 'server_config', message: 'Cloudinary is not configured on the server.' },
        { status: 503 }
      );
    }

    const resolvedParams = await context.params;
    const { widgetId } = resolvedParams;

    if (!widgetId) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing widget ID' }, { status: 400 });
    }

    let body: { publicId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'bad_request', message: 'Request body must be JSON with a "publicId" field.' }, { status: 400 });
    }

    const { publicId } = body;
    if (!publicId || typeof publicId !== 'string' || !publicId.trim()) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing "publicId" in request body.' }, { status: 400 });
    }

    // Destroy the asset from Cloudinary
    const destroyResult = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });

    if (destroyResult.result !== 'ok' && destroyResult.result !== 'not found') {
      return NextResponse.json(
        { error: 'delete_failed', message: `Cloudinary returned: ${destroyResult.result}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ deleted: true, result: destroyResult.result }, { status: 200 });
  } catch (error: any) {
    console.error('[api/widgets/avatar] DELETE failed:', error);
    return NextResponse.json({ error: 'delete_failed', message: error?.message || 'Failed to delete avatar' }, { status: 500 });
  }
}
