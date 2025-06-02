import { Injectable } from '@angular/core';
import { DataService } from '../data/data.service';
import { ToastService } from '../toast.service';
import { Subject } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class AttachmentService {

  constructor(private dataService: DataService, private toastService: ToastService) { }

  generateFileName(file:any){
    let time = new Date().getTime()
    let fileType = file.type.split('/').pop()
    return `${time}.${fileType}`
  }

  convertTobase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result as string;
        resolve(base64String);
      };
      reader.onerror = (err) => {
        reject(err);
      };
      reader.readAsDataURL(file);
    });
  }

  base64ToFile(file:any){
    const contentType = file.split(';')[0].split(':')[1];
    const byteCharacters = atob(file.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });
    return blob
  }

  isFileSizeGreater(file:any){
    let config = this.dataService.getConfig()
    let maxLimit = config.maxFileSize * 1024 * 1024
    if(file.size > maxLimit){
      this.toastService.showToast("FILE_SIZE_EXCEEDED_ERROR_MSG","danger")
      return true
    }else{
      return false
    }
  }

  private triggerSubject = new Subject<void>();

  trigger$ = this.triggerSubject.asObservable();

  triggerMainWrapperComponent() {
    this.triggerSubject.next();
  }
}