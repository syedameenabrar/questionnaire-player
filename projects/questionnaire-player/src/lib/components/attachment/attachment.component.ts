import {
  Component,
  ElementRef,
  Input,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AlertComponent } from '../alert/alert.component';
import { Observable } from 'rxjs/internal/Observable';
import { types, limit } from '../../constants/file-formats.json';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../services/api.service';
import { PrivacyPopupComponent } from '../privacy-popup/privacy-popup.component';
import { ToastService } from '../../services/toast.service';
import { DbService } from '../../services/db/db.service';
import { AttachmentService } from '../../services/attachment/attachment.service';
import { DialogComponent } from '../dialog/dialog.component';
@Component({
  selector: 'lib-attachment',
  templateUrl: './attachment.component.html',
  styleUrls: ['./attachment.component.scss'],
})
export class AttachmentComponent {
  @Input() data;
  @Input() fileSizeLimit: number = limit;
  @Input() questionId;
  formData;
  objectURL: string;
  formats = types;
  @ViewChild('previewModal') previewModal: TemplateRef<any>;
  @ViewChild(DialogComponent) childDialogComponent: DialogComponent;
  @ViewChild('fileInput') fileInput: ElementRef;
  fileUploadResponse = null;
  objectType: string;
  docPreviewAlertRef: any;
  dialogRef: any;
  @Input() questionFile;
  public isConsentGiven = false;
  isDimmed: any;
  hint: string;
  hintModalNote: string;
  constructor(
    private dialog: MatDialog,
    public toastService: ToastService,
    private db: DbService,
    private attachmentService: AttachmentService
  ) {}

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const inputElement = document.getElementById(
        `${this.questionId}`
      ) as HTMLElement;
      inputElement.click();
    }
  }

  basicUpload(event) {
    const files: FileList = event.target.files;
    let sizeMB = +(files[0].size / 1000 / 1000).toFixed(4);
    if (sizeMB > this.fileSizeLimit) {
      this.fileLimitCross();
      return;
    }
    this.formData = new FormData();
    Array.from(files).forEach((f) => this.formData.append('file', f));
    const fileNames = this.getFileNames(this.formData);
    fileNames.map((fileName, index) => {
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
        const fileDetails = {
          name: fileName,
          type: fileType,
          question_id: this.questionId,
          submissionId: this.data.submissionId,
          file: files[index],
        };
        this.fileUpload(fileDetails);
      }
    });
    event.target.value = '';
  }

  async fileUpload(data) {
    let payload: any = {};
    payload['ref'] = 'survey';
    payload['request'] = {};
  
    const submissionId = data.submissionId;
  
    // Create timestamped name with extension
    const originalName = data.file.name; // e.g., "document.pdf"
    const extension = originalName.split('.').pop()?.toLowerCase() || 'file';
    const timestamp = Date.now(); // current timestamp in ms
    const fileName = `${timestamp}.${extension}`; // e.g., "1718734382040.pdf"
  
    // Attach filename to payload
    payload['request'][submissionId] = {
      files: [fileName],
    };
  
    // Convert to base64
    const convertedFile = await this.attachmentService.convertTobase64(data.file);
  
    // Save to IndexedDB with timestamped filename as key
    const dataToAdd = {
      key: fileName,
      data: convertedFile,
    };
    this.db.addData(dataToAdd);
  
    this.closeDialog();
  
    // Store the full file info with the new name
    const abc = {
      // ...data,
      name: fileName,
      isUploaded: false,
    };
  
    // Mocking upload response and alert
    this.fileUploadResponse = {
      status: 200,
      data: abc,
      question_id: data.question_id,
    };
  
    const alertDialogConfig = {
      message: 'File uploaded successfully!',
      acceptLabel: 'Ok',
      cancelLabel: null,
    };
  
    // Update UI
    this.data.files.push(abc);
    this.openAlert(alertDialogConfig);
    this.attachmentService.triggerMainWrapperComponent();
  }
  

  filesTrackBy(index, file) {
    return file.url;
  }
  
  getFileType(fileName) {
    const type = fileName.split('.').pop();
    for (const key of Object.keys(this.formats)) {
      if (this.formats[key].includes(type.toLowerCase())) {
        return key;
      }
    }
  }

  closeDialog() {
    if (this.dialogRef) {
      this.dialogRef?.close();
    }
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
  
      const blob = this.attachmentService.base64ToFile(base64Data);  // Make sure this handles correct MIME
      url = URL.createObjectURL(blob);
    }
  
    // 🔸 Handle image or video preview in modal
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
  
    // 🔸 Unsupported preview – fallback to download
    if (!isSupported) {

  
      const shareOptions = {
        type: "preview",
        title: file.name,
        fileType: extension,
        isBase64: !file.previewUrl,
        url: file.previewUrl ? file.previewUrl : base64Data
      };
  
      const response =await this.postMessageListener(shareOptions);
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
  
    // 🔸 Optional alert for specific types
    // if (extension === 'doc') {
    //   this.openAlert({
    //     title: null,
    //     message: `Please wait, it may take up to a minute to load.`,
    //     acceptLabel: 'Close Preview',
    //     cancelLabel: null,
    //   }, true);
    // }
  }
  
  
  
  
  async openUrl(file: any) {
    let url: string = "";
      let result = await this.db.getData(file.name);
      let base64Data = result?.data;
 
  
    // Step 4: Prepare Share Options
    const shareOptions = {
      type: "preview",
      title: file.name,
      fileType: "pdf",
      isBase64: !file.previewUrl,
      url: file.previewUrl ? file.previewUrl : base64Data
    };
  
    // Step 5: Post to WebView (if applicable), else fallback to new tab
    const response = await this.postMessageListener(shareOptions);
    if (!response) {
         // Step 1: Try using previewUrl if available
    if (file.previewUrl) {
      url = file.previewUrl;
    } else {
      // Step 2: Fetch base64 data from IndexedDB
      
      if (!base64Data || typeof base64Data !== 'string' || base64Data.trim() === "") {
        this.openAlert({
          title: 'File Error',
          message: `The file could not be previewed. Data is missing or corrupt.`,
          acceptLabel: 'OK',
          cancelLabel: null
        });
        return;
      }
  
      // Step 3: Convert base64 to Blob and create Object URL
      const blob = this.attachmentService.base64ToFile(base64Data);
      url = URL.createObjectURL(blob);
    }
      window.open(url, '_blank');
    }
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

  async openAlert(alertDialogConfig, msgAlertForDoc?) {
    const dialogRef = await this.dialog.open(AlertComponent, {
      data: alertDialogConfig,
      width: 'auto',
      enterAnimationDuration: 300,
      exitAnimationDuration: 150,
      disableClose: true,
    });

    if (msgAlertForDoc) {
      this.docPreviewAlertRef = dialogRef;
    } else {
      this.dialogRef = dialogRef;
    }

    return new Observable<boolean>((observer) => {
      dialogRef.afterClosed().subscribe((res) => {
        if (res) {
          this.closeDialog();
        }
        observer.next(res);
        observer.complete();
      });
    }).toPromise();
  }

  getFileNames(formData) {
    let files = [];
    formData.forEach((element) => {
      files.push(element.name);
    });
    return files;
  }

  async deleteAttachment(fileIndex?) {
    const alertDialogConfig = {
      message: 'Do you want to delete the file?',
      acceptLabel: 'Yes',
      cancelLabel: 'No',
    };
    const accepted = await this.openAlert(alertDialogConfig);
    if (!accepted) {
      return;
    }
    this.data.files.splice(fileIndex, 1);
    this.attachmentService.triggerMainWrapperComponent();
  }
  async handleFileUpload(questionId: string) {
    try {
      const data = await this.showPrivacyPolicyPopup().toPromise();
      if(data){
        if (data.isChecked && data.upload) {
          this.isConsentGiven = true;
          this.questionId = questionId;
  
          const fileInputElement = document.getElementById(
            questionId
          ) as HTMLInputElement;
          if (fileInputElement) {
            fileInputElement.click();
          }
        } else{
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

  showPrivacyPolicyPopup(): Observable<any> {
    const dialogRef = this.dialog.open(PrivacyPopupComponent, {
      width: '400px',
      minHeight: '150px',
    });

    return dialogRef.afterClosed();
  }

  openDialog() {
    this.isDimmed = !this.isDimmed;
    this.hint = "Accepted formats are png,jpg,jpeg,pdf,mp4 and Maximum file size upload limit is 50MB.";
    this.hintModalNote = "Note: This is the hint for the following attachment";
    this.childDialogComponent.openDialog('300ms', '150ms');
  }

  closeHint(){
    this.isDimmed = false;
  }


  docLoader() {
    this.docPreviewAlertRef.close();
  }

  postMessageListener(data:any):Promise<boolean>{
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
