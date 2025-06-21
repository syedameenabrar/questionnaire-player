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
  @ViewChild('fileInput') fileInput: ElementRef;
  fileUploadResponse = null;
  objectType: string;
  docPreviewAlertRef: any;
  dialogRef: any;
  @Input() questionFile;
  public isConsentGiven = false;
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
    payload['request'][submissionId] = {
      files: [data.name],
    };


    let convertedFile = await this.attachmentService.convertTobase64(data.file)

    let dataToAdd = {
      key: data?.name,
      data: convertedFile
    }
    this.db.addData(dataToAdd)
    this.closeDialog();

    let abc = {
      ...data,
      file: convertedFile,
       isUploaded : false,
     }


     this.fileUploadResponse = {
      status: 200,
      data: data,
      question_id: data.question_id,
    };
            const alertDialogConfig = {
              message: 'File uploaded successfully!',
              acceptLabel: 'Ok',
              cancelLabel: null,
            };
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
    // console.log("file2", file, type);
  
    // Determine extension safely
    const fileName = file.name || '';
    const extension = fileName.split('.').pop()?.toLowerCase() || 'unknown';
  
    // Build object URL
    let url: any = '';
    if (file.previewUrl) {
      url = file.previewUrl;
    } else {
      const blob = this.attachmentService.base64ToFile(file.file);
      url = URL.createObjectURL(blob);
    }
  
    const allSupportedTypes = [
      ...this.formats.image,
      ...this.formats.video,
      ...this.formats.audio,
      ...this.formats.pdf
    ].map(t => t.toLowerCase());
  
    const isSupported = allSupportedTypes.includes(type.toLowerCase()) || allSupportedTypes.includes(extension);
  
    if(type == "image" || type == "video"){
          // Supported file – open in preview dialog
    this.objectURL = url;
    this.objectType = type;
    this.dialogRef = this.dialog.open(this.previewModal, {
      width: 'auto',
      height: 'auto',
      enterAnimationDuration: 300,
      exitAnimationDuration: 150,
    });
    return
    }
    if (!isSupported) {
      // Not supported – download instead
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
  
      const shareOptions = {
        type: "download",
        title: file.name,
        fileType: extension,
        isBase64: !file.previewUrl,
        url: file.previewUrl || file.file
      };
  
      // console.log(":shareOptions", shareOptions);
      await this.postMessageListener(shareOptions);
  
      return;
    }
  
  
    if (extension === 'doc') {
      this.openAlert({
        title: null,
        message: `Please wait, it may take up to a minute to load.`,
        acceptLabel: 'Close Preview',
        cancelLabel: null,
      }, true);
    }
  }
  
  

 async openUrl(file: any) {
  // console.log("file1",file)
    let url:any ="";
    if(file.previewUrl){
      url = file.previewUrl
    }else{
      const blob = this.attachmentService.base64ToFile(file.file);
      url = URL.createObjectURL(blob);
    }

    const shareOptions = {
      type: "download",
      title: file.name,
      fileType: "pdf",
      isBase64: !file.previewUrl,
      url: file.previewUrl || file.file
    }

    let response = await this.postMessageListener(shareOptions)
if(!response){
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
