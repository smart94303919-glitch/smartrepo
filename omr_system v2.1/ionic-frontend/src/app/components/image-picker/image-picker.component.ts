/**
 * image-picker.component.ts
 * ==========================
 * Handles getting a photo of an OMR sheet into the app, via either:
 *   - the device camera (@capacitor/camera, CameraSource.Camera)
 *   - the photo gallery / file picker (@capacitor/camera, CameraSource.Photos)
 *
 * Emits the captured image as a `File` (via `imageCaptured`), ready to be
 * handed straight to OmrApiService.gradeSheet(). This component does NOT
 * call the API itself -- it only acquires the image -- so it can be reused
 * for both "capture teacher key" and "capture student sheet" flows by the
 * parent component, which decides mode='key' vs mode='grade'.
 */
import { Component, EventEmitter, Output } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-image-picker',
  templateUrl: './image-picker.component.html',
  styleUrls: ['./image-picker.component.scss'],
})
export class ImagePickerComponent {
  /** Fired once an image has been acquired, either by camera or gallery. */
  @Output() imageCaptured = new EventEmitter<File>();

  /** Local preview shown in the template after capture, before upload. */
  previewDataUrl: string | null = null;

  constructor(private toastCtrl: ToastController) {}

  /** Opens the native camera UI directly. */
  async captureFromCamera() {
    await this.acquireImage(CameraSource.Camera);
  }

  /** Opens the native photo gallery / file picker. */
  async importFromGallery() {
    await this.acquireImage(CameraSource.Photos);
  }

  private async acquireImage(source: CameraSource) {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source,
        quality: 90,
        // Capacitor applies EXIF-orientation correction for us on the
        // native side; the backend ALSO re-applies it defensively via
        // PIL's exif_transpose in api_server.py, so a sheet photographed
        // in portrait won't arrive sideways either way.
        correctOrientation: true,
        // Cap the longest edge so very large phone photos (12MP+) don't
        // balloon upload time; 2000px is comfortably more resolution than
        // the OMR pipeline's WARP_WIDTH/WARP_HEIGHT (1000x1414) needs.
        width: 2000,
      });

      if (!photo.dataUrl) {
        await this.showToast('No image was captured.', 'danger');
        return;
      }

      this.previewDataUrl = photo.dataUrl;
      const file = this.dataUrlToFile(photo.dataUrl, 'omr_capture.jpg');
      this.imageCaptured.emit(file);
    } catch (err: any) {
      // User cancelling the camera/gallery picker throws too -- don't
      // show an error toast for that specific case.
      const cancelled = String(err?.message ?? '').toLowerCase().includes('cancel');
      if (!cancelled) {
        await this.showToast('Could not access camera/gallery. Check app permissions.', 'danger');
      }
    }
  }

  private dataUrlToFile(dataUrl: string, filename: string): File {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], filename, { type: mime });
  }

  private async showToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color });
    await toast.present();
  }
}
