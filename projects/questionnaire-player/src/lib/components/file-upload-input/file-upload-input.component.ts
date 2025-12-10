import { Component, Input, OnInit, ViewChild, ElementRef, TemplateRef } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Question } from '../../interfaces/questionnaire.type';
import { QuestionnaireService } from '../../services/questionnaire.service';
import { MatDialog } from '@angular/material/dialog';
import { AlertComponent } from '../alert/alert.component';
import { Observable } from 'rxjs';
import { types, limit } from '../../constants/file-formats.json';
import { ToastService } from '../../services/toast.service';
import { DbService } from '../../services/db/db.service';
import { AttachmentService } from '../../services/attachment/attachment.service';
import { PrivacyPopupComponent } from '../privacy-popup/privacy-popup.component';

@Component({
  selector: 'lib-file-upload-input',
  templateUrl: './file-upload-input.component.html',
  styleUrls: ['./file-upload-input.component.scss'],
})
export class FileUploadInputComponent implements OnInit {
  @Input() questionnaireForm: FormGroup;
  @Input() question: Question;
  @Input() fileSizeLimit: number = limit;
  @ViewChild('fileInput') fileInput: ElementRef;
  @ViewChild('previewModal') previewModal: TemplateRef<any>;
  
  formats = types;
  public isConsentGiven = false;
  fileList: any[] = [];
  objectURL: string;
  objectType: string;
  dialogRef: any;

  constructor(
    public qService: QuestionnaireService,
    private dialog: MatDialog,
    public toastService: ToastService,
    private db: DbService,
    private attachmentService: AttachmentService
  ) {}

  ngOnInit() {
    // Initialize file list from question value if exists
    const fileName = (this.question as any).fileName;
    if (fileName && Array.isArray(fileName)) {
      this.fileList = [...fileName];
    }

    setTimeout(() => {
      this.questionnaireForm.addControl(
        this.question._id,
        new FormControl(this.fileList || [], [
          this.qService.validate(this.question)
        ])
      );
      this.question.startTime = this.question.startTime
        ? this.question.startTime
        : Date.now();
    });
  }

  get isValid(): boolean {
    return this.questionnaireForm.controls[this.question._id].valid;
  }

  get isTouched(): boolean {
    return this.questionnaireForm.controls[this.question._id].touched;
  }

  getValidationMessage(controlName: string): string {
    const control = this.questionnaireForm.get(controlName);
    if (control.errors) {
      const validationErrors = control.errors;
      if (validationErrors['err']) {
        return validationErrors['err'];
      }
    }
    return '';
  }

  async handleFileUpload() {
    try {
      const data = await this.showPrivacyPolicyPopup().toPromise();
      if (data) {
        if (data.isChecked && data.upload) {
          this.isConsentGiven = true;
          const fileInputElement = document.getElementById(
            `input-${this.question._id}`
          ) as HTMLInputElement;
          if (fileInputElement) {
            fileInputElement.click();
          }
        } else {
          this.toastService.showToast(
            'Evidence not uploaded. Please click on attach and accept the content policy terms.',
            'danger'
          );
        }
      }
    } catch (error) {
      console.error('Error handling file upload:', error);
      this.toastService.showToast(
        'An error occurred. Please try again.',
        'danger'
      );
    }
  }

  onFileSelected(event: Event) {
    if (this.isConsentGiven) {
      this.basicUpload(event);
      this.isConsentGiven = false;
    } else {
      this.toastService.showToast(
        'Please accept the terms before uploading.',
        'danger'
      );
    }
  }

  basicUpload(event) {
    const files: FileList = event.target.files;
    let sizeMB = +(files[0].size / 1000 / 1000).toFixed(4);
    if (sizeMB > this.fileSizeLimit) {
      this.fileLimitCross();
      return;
    }
    
    Array.from(files).forEach((file) => {
      const fileName = file.name;
      const fileType = this.getFileType(fileName);
      if (!fileType || fileType == undefined) {
        const alertDialogConfig = {
          title: null,
          message: `Invalid file format.`,
          acceptLabel: 'Ok',
          cancelLabel: null,
        };
        this.openAlert(alertDialogConfig);
        return;
      } else {
        this.fileUpload(file, fileName, fileType);
      }
    });
    event.target.value = '';
  }

  async fileUpload(file: File, originalName: string, fileType: string) {
    const submissionId = this.qService.getSubmissionId();
    
    // Create timestamped name with extension
    const extension = originalName.split('.').pop()?.toLowerCase() || 'file';
    const timestamp = Date.now();
    const fileName = `${timestamp}.${extension}`;
    
    // Convert to base64
    const convertedFile = await this.attachmentService.convertTobase64(file);
    
    // Save to IndexedDB with timestamped filename as key
    const dataToAdd = {
      key: fileName,
      data: convertedFile,
    };
    this.db.addData(dataToAdd);
    
    // Store the full file info with the new name
    const fileInfo = {
      name: fileName,
      isUploaded: false,
      originalName: originalName,
      type: fileType,
    };
    
    // Add to file list
    this.fileList.push(fileInfo);
    
    // Update form control
    this.questionnaireForm.controls[this.question._id].setValue(this.fileList);
    (this.question as any).fileName = this.fileList;
    this.question.value = this.fileList.map(f => f.name);
    this.question.endTime = Date.now();
    
    // Trigger main wrapper component update
    this.attachmentService.triggerMainWrapperComponent();
    
    const alertDialogConfig = {
      message: 'File uploaded successfully!',
      acceptLabel: 'Ok',
      cancelLabel: null,
    };
    this.openAlert(alertDialogConfig);
  }

  getFileType(fileName: string) {
    const type = fileName.split('.').pop();
    for (const key of Object.keys(this.formats)) {
      if (this.formats[key].includes(type.toLowerCase())) {
        return key;
      }
    }
  }

  async deleteAttachment(fileIndex: number) {
    const alertDialogConfig = {
      message: 'Do you want to delete the file?',
      acceptLabel: 'Yes',
      cancelLabel: 'No',
    };
    const accepted = await this.openAlert(alertDialogConfig);
    if (!accepted) {
      return;
    }
    this.fileList.splice(fileIndex, 1);
    this.questionnaireForm.controls[this.question._id].setValue(this.fileList);
    (this.question as any).fileName = this.fileList;
    this.question.value = this.fileList.map(f => f.name);
    this.attachmentService.triggerMainWrapperComponent();
  }

  fileLimitCross() {
    const alertDialogConfig = {
      title: null,
      message: `The file is too large and cannot be uploaded. The file you are trying to upload has exceeded the maximum file size ${this.fileSizeLimit} MB`,
      acceptLabel: 'Ok',
      cancelLabel: null,
    };
    this.openAlert(alertDialogConfig);
  }

  async openAlert(alertDialogConfig) {
    const dialogRef = await this.dialog.open(AlertComponent, {
      data: alertDialogConfig,
      width: 'auto',
      enterAnimationDuration: 300,
      exitAnimationDuration: 150,
      disableClose: true,
    });

    return new Observable<boolean>((observer) => {
      dialogRef.afterClosed().subscribe((res) => {
        observer.next(res);
        observer.complete();
      });
    }).toPromise();
  }

  showPrivacyPolicyPopup(): Observable<any> {
    const dialogRef = this.dialog.open(PrivacyPopupComponent, {
      width: '400px',
      minHeight: '150px',
    });
    return dialogRef.afterClosed();
  }

  filesTrackBy(index, file) {
    return file.name || index;
  }

  async showFilePreview(file: any, type: string) {
    const fileName = file.name || '';
    const extension = fileName.split('.').pop()?.toLowerCase() || 'unknown';
  
    // Supported formats
    const allSupportedTypes = [
      ...this.formats.image,
      ...this.formats.video,
      ...this.formats.audio,
      ...this.formats.pdf
    ].map(t => t.toLowerCase());
  
    const isSupported = allSupportedTypes.includes(type.toLowerCase()) || allSupportedTypes.includes(extension);
  
    let url: string = '';
    let result = await this.db.getData(file.name);
    let base64Data = result?.data;

    if (file.previewUrl) {
      url = file.previewUrl;
    } else {
      if (!base64Data || typeof base64Data !== 'string') {
        this.openAlert({
          title: 'File Error',
          message: `Could not load file: ${file.name}. File might be missing or corrupted.`,
          acceptLabel: 'OK',
          cancelLabel: null
        });
        return;
      }
  
      const blob = this.attachmentService.base64ToFile(base64Data);
      url = URL.createObjectURL(blob);
    }
  
    // Handle image or video preview in modal
    if (type === 'image' || type === 'video' || type === 'audio') {
      this.objectURL = url;
      this.objectType = type;
      this.dialogRef = this.dialog.open(this.previewModal, {
        width: 'auto',
        height: 'auto',
        enterAnimationDuration: 300,
        exitAnimationDuration: 150,
      });
      return;
    }
  
    // Unsupported preview – fallback to download
    if (!isSupported) {
      const shareOptions = {
        type: "preview",
        title: file.name,
        fileType: extension,
        isBase64: !file.previewUrl,
        url: file.previewUrl ? file.previewUrl : base64Data
      };
  
      const response = await this.postMessageListener(shareOptions);
      if (!response) {
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name || `download.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    
        this.openAlert({
          title: 'Preview Not Supported',
          message: `${extension.toUpperCase()} files cannot be previewed. The file will be downloaded instead.`,
          acceptLabel: 'OK',
          cancelLabel: null
        });
      }
    }
  }

  async openUrl(file: any) {
    let url: string = "";
    let result = await this.db.getData(file.name);
    let base64Data = result?.data;

    const shareOptions = {
      type: "preview",
      title: file.name,
      fileType: "pdf",
      isBase64: !file.previewUrl,
      url: file.previewUrl ? file.previewUrl : base64Data
    };
  
    const response = await this.postMessageListener(shareOptions);
    if (!response) {
      if (file.previewUrl) {
        url = file.previewUrl;
      } else {
        if (!base64Data || typeof base64Data !== 'string' || base64Data.trim() === "") {
          this.openAlert({
            title: 'File Error',
            message: `The file could not be previewed. Data is missing or corrupt.`,
            acceptLabel: 'OK',
            cancelLabel: null
          });
          return;
        }
  
        const blob = this.attachmentService.base64ToFile(base64Data);
        url = URL.createObjectURL(blob);
      }
      window.open(url, '_blank');
    }
  }

  closeDialog() {
    if (this.dialogRef) {
      this.dialogRef?.close();
    }
  }

  postMessageListener(data: any): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if ((window as any).FlutterChannel) {
          (window as any).FlutterChannel.postMessage(data);
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (err: any) {
        console.error('FlutterChannel Error:', err);
        resolve(false);
      }
    });
  }
}

