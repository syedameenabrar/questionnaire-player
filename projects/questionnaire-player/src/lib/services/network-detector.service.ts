import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, fromEvent, merge, of } from 'rxjs';
import { mapTo } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class NetworkDetectorService {
  private isOnline = new BehaviorSubject<boolean>(navigator.onLine);

  constructor() {
    this.initializeNetworkEvents();
  }

  private initializeNetworkEvents() {
    // Listen to online and offline events
    const online$ = fromEvent(window, 'online').pipe(mapTo(true));
    const offline$ = fromEvent(window, 'offline').pipe(mapTo(false));

    merge(online$, offline$).subscribe(status => {
      this.isOnline.next(status);
    });
  }

  // Returns an observable to check network status in real-time
  getNetworkStatus(): Observable<boolean> {
    return this.isOnline.asObservable();
  }

  // Check the current status
  isConnected(): boolean {
    return this.isOnline.value;
  }
}
