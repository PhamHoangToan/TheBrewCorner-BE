import { Injectable } from '@nestjs/common'
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary'

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })
  }

  uploadBuffer(buffer: Buffer): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'the-brew-corner' },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'))
          resolve(result)
        },
      )
      stream.end(buffer)
    })
  }
}
