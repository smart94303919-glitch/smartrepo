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
import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Camera, CameraResultType, CameraSource, GalleryPhoto } from '@capacitor/camera';
import { IonicModule, ToastController } from '@ionic/angular';

export const MAX_BATCH_IMAGES = 10;
const MAX_IMAGE_EDGE = 1920;
const JPEG_QUALITY = 0.8;

@Component({
  selector: 'app-image-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './image-picker.component.html',
  styleUrls: ['./image-picker.component.scss'],
})
export class ImagePickerComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Which workflow is active: 'key' = Teacher Answer Key, 'grade' = Student Sheet. */
  @Input() scanMode: 'key' | 'grade' = 'key';

  /** Fired once a single image has been acquired (camera capture or single gallery pick). */
  @Output() imageCaptured = new EventEmitter<File>();

  /** Fired when a batch of images is imported from the gallery (1-5 images). */
  @Output() imagesCaptured = new EventEmitter<File[]>();
  /** Local preview shown in the template after capture, before upload. */
  previewDataUrl: string | null = null;

  /** Batch preview thumbnails for gallery imports. */
  batchPreviewUrls: string[] = [];

  cameraLocked = false;
  isCameraActive = false;
  isCameraReady = false;
  isFlashing = false;
  isProcessingCapture = false;
  focusRing: { x: number; y: number } | null = null;
  currentFacingMode: 'environment' | 'user' = 'environment';
  hasMultipleCameras = false;
  private mediaStream: MediaStream | null = null;
  private focusRingTimer: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('videoElement') private videoElement?: ElementRef<HTMLVideoElement>;

  constructor(private toastCtrl: ToastController) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['scanMode'] && !changes['scanMode'].firstChange) {
      this.stopCamera();
      this.clearPreviews();
      this.cameraLocked = false;
    }
  }

  ngAfterViewInit() {
    this.attachCameraStream();
  }

  ngOnDestroy() {
    this.clearFocusRing();
    this.stopCamera();
  }

  resetStudentSheet() {
    this.stopCamera();
    this.clearPreviews();
    this.cameraLocked = false;
  }

  resetTeacherKey() {
    this.stopCamera();
    this.clearPreviews();
    this.cameraLocked = false;
  }

  private clearPreviews() {
    this.previewDataUrl = null;
    this.batchPreviewUrls = [];
  }

  async openCamera() {
    if (this.isCameraActive || !navigator.mediaDevices?.getUserMedia) {
      await this.showToast('Camera capture is not available in this browser.', 'danger');
      return;
    }

    if (!await this.requestCameraPermission()) {
      return;
    }

    this.isCameraActive = true;
    this.isCameraReady = false;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: this.currentFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.hasMultipleCameras = devices.filter((device) => device.kind === 'videoinput').length > 1;
      this.attachCameraStream();
    } catch (err) {
      console.error('Error accessing camera:', err);
      this.stopCamera();
      await this.showToast('Unable to access camera. Check camera permissions.', 'danger');
    }
  }

  attachCameraStream() {
    const video = this.videoElement?.nativeElement;
    if (!video || !this.mediaStream) return;

    video.srcObject = this.mediaStream;
    video.play().then(() => (this.isCameraReady = true)).catch(() => {
      this.isCameraReady = false;
    });
  }

  async captureSnapshot(): Promise<File | null> {
    const video = this.videoElement?.nativeElement;
    if (!video || !this.mediaStream || !video.videoWidth || !video.videoHeight) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const originalFile = this.dataUrlToFile(dataUrl, `captured_sheet_${Date.now()}.jpg`);
    const file = await this.compressImage(originalFile, originalFile.name);
    this.stopCamera();
    if (this.scanMode === 'grade') this.cameraLocked = true;
    this.previewDataUrl = dataUrl;
    return file;
  }

  async triggerMobileCapture() {
    if (this.isProcessingCapture || !this.isCameraReady) return;

    this.isProcessingCapture = true;
    this.isFlashing = true;
    await new Promise((resolve) => setTimeout(resolve, 150));
    this.isFlashing = false;

    const file = await this.captureSnapshot();
    if (file) {
      this.imageCaptured.emit(file);
    }
    this.isProcessingCapture = false;
  }

  async switchCamera() {
    if (this.isProcessingCapture || !this.isCameraActive || !this.hasMultipleCameras) return;

    this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    this.stopCamera();
    await this.openCamera();
  }

  stopCamera() {
    this.clearFocusRing();
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    const video = this.videoElement?.nativeElement;
    if (video) video.srcObject = null;
    this.isCameraActive = false;
    this.isCameraReady = false;
  }

  async focusCamera(event: MouseEvent): Promise<void> {
    const container = event.currentTarget as HTMLElement | null;
    if (!container || !this.mediaStream) return;

    const bounds = container.getBoundingClientRect();
    this.focusRing = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    this.clearFocusRingTimer();
    this.focusRingTimer = setTimeout(() => this.clearFocusRing(), 1000);

    const videoTrack = this.mediaStream.getVideoTracks()[0];
    if (!videoTrack?.applyConstraints) return;

    try {
      await videoTrack.applyConstraints({
        advanced: [{ focusMode: 'continuous' }],
      } as unknown as MediaTrackConstraints);
    } catch (error) {
      // Focus controls are optional and unsupported on some browsers/devices.
      console.debug('Camera focus constraint is unavailable:', error);
    }
  }

  private clearFocusRingTimer() {
    if (this.focusRingTimer) {
      clearTimeout(this.focusRingTimer);
      this.focusRingTimer = null;
    }
  }

  private clearFocusRing() {
    this.clearFocusRingTimer();
    this.focusRing = null;
  }

  /** Opens the native camera UI directly. */
  async captureFromCamera() {
    this.batchPreviewUrls = [];
    await this.openCamera();
  }

  /** Opens the native photo gallery / file picker. */
  async importFromGallery() {
    if (!await this.requestPhotoPermission()) {
      return;
    }

    if (this.scanMode === 'grade') {
      this.previewDataUrl = null;
      // Student Sheet mode: batch import of 1 to 5 images.
      const files = await this.acquireBatchImages();
      if (files.length > 0) {
        this.imagesCaptured.emit(files);
      }
    } else {
      // Teacher Answer Key mode: strictly single image.
      const file = await this.acquireSingleImage(CameraSource.Photos);
      if (file) {
        this.imageCaptured.emit(file);
      }
    }
  }

  private async requestCameraPermission(): Promise<boolean> {
    try {
      const permission = await Camera.checkPermissions();
      if (permission.camera === 'granted') {
        return true;
      }

      const requested = await Camera.requestPermissions({ permissions: ['camera'] });
      if (requested.camera !== 'granted') {
        await this.showToast('Camera permission is required to scan answer sheets.', 'danger');
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Native camera permission request unavailable:', error);
      return true;
    }
  }

  private async requestPhotoPermission(): Promise<boolean> {
    try {
      const permission = await Camera.checkPermissions();
      if (permission.photos === 'granted' || permission.photos === 'limited') {
        return true;
      }

      const requested = await Camera.requestPermissions({ permissions: ['photos'] });
      if (requested.photos !== 'granted' && requested.photos !== 'limited') {
        await this.showToast('Photo library permission is required to upload answer sheets.', 'danger');
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Native photo permission request unavailable:', error);
      return true;
    }
  }

  /** Acquires exactly one image from the given source. */
  private async acquireSingleImage(source: CameraSource): Promise<File | null> {
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
        return null;
      }

      const file = this.dataUrlToFile(photo.dataUrl, 'omr_capture.jpg');
      const compressed = await this.compressImage(file, file.name);
      this.previewDataUrl = await this.fileToDataUrl(compressed);
      return compressed;
    } catch (err: any) {
      // User cancelling the camera/gallery picker throws too -- don't
      // show an error toast for that specific case.
      const cancelled = String(err?.message ?? '').toLowerCase().includes('cancel');
      if (!cancelled) {
        await this.showToast('Could not access camera/gallery. Check app permissions.', 'danger');
      }
      return null;
    }
  }

  /** Acquires a batch of 1-5 images from the gallery (Student Sheet mode only). */
  private async acquireBatchImages(): Promise<File[]> {
    try {
      const result = await Camera.pickImages({
        quality: 90,
        width: 2000,
        correctOrientation: true,
        // Limit the picker to a maximum of 5 images.
        limit: MAX_BATCH_IMAGES,
      });

      const photoList: GalleryPhoto[] = result?.photos ?? [];

      if (photoList.length === 0) {
        await this.showToast('No images were selected.', 'danger');
        return [];
      }

      if (photoList.length > MAX_BATCH_IMAGES) {
        await this.showToast(`You can import up to ${MAX_BATCH_IMAGES} photos per session.`, 'danger');
        return [];
      }

      const files: File[] = [];
      this.batchPreviewUrls = [];

      for (let i = 0; i < photoList.length; i++) {
        const photo = photoList[i];
        if (!photo.webPath) continue;
        this.batchPreviewUrls.push(photo.webPath);
        const file = await this.webPathToFile(photo.webPath, `omr_capture_${i + 1}.jpg`);
        if (file) {
          files.push(await this.compressImage(file, file.name));
        }
      }

      if (files.length === 0) {
        await this.showToast('No valid images were selected.', 'danger');
        return [];
      }

      return files;
    } catch (err: any) {
      const cancelled = String(err?.message ?? '').toLowerCase().includes('cancel');
      if (!cancelled) {
        await this.showToast('Could not access gallery. Check app permissions.', 'danger');
      }
      return [];
    }
  }

  /** Fetches a File from a Capacitor webPath (blob: or file:// URL). */
  private async webPathToFile(webPath: string, filename: string): Promise<File | null> {
    try {
      const response = await fetch(webPath);
      const blob = await response.blob();
      return new File([blob], filename, { type: blob.type || 'image/jpeg' });
    } catch {
      return null;
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

  /** Resize camera/gallery images before upload to keep mobile RAM and request size bounded. */
  private async compressImage(file: File, filename: string): Promise<File> {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();

      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return file;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
      );
      if (!blob) return file;
      return new File([blob], filename.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private async showToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color });
    await toast.present();
  }
}
