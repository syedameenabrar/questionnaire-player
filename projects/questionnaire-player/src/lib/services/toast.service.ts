import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NetworkDetectorService } from './network-detector.service';

@Injectable({
  providedIn: 'root'
})
export class ToastService {

  constructor(private snackBar: MatSnackBar, private networkService: NetworkDetectorService) { }

  showToast(message:string,type?:string,duration?:number,verticalPosition?:any,horizontalPosition?:any){
    let styleClass = type ? type : "default"
    let snackBarConfig = {
      duration: duration ? duration : 3000,
      verticalPosition: verticalPosition ? verticalPosition : 'top',
      horizontalPosition: horizontalPosition ? horizontalPosition : "center",
      panelClass: [styleClass]
    }
    this.snackBar.open(message,'',snackBarConfig)
  }

  async showNetworkToast(message: string,type?:string,duration?:number,verticalPosition?:any,horizontalPosition?:any) {
    if (!this.networkService.isConnected()) {
      console.warn('No internet connection. Toast will not be shown.');
      return;
    }

    let styleClass = type ? type : "default"
    let snackBarConfig = {
      duration: duration ? duration : 3000,
      verticalPosition: verticalPosition ? verticalPosition : 'top',
      horizontalPosition: horizontalPosition ? horizontalPosition : "center",
      panelClass: [styleClass]
    }
    this.snackBar.open(message,'',snackBarConfig)
  }

  clearToaster(){
    if (this.snackBar) {
      this.snackBar.dismiss();

    }
  }
}