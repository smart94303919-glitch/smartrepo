import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';   // ✅ import Router

@Component({
  selector: 'app-cmbtp',
  templateUrl: './cmbtp.page.html',
  styleUrls: ['./cmbtp.page.scss'],
  standalone: true,   // keep standalone
  imports: [CommonModule, IonicModule]  // ✅ import Ionic + Common
})
export class CmbtpPage {
  constructor(private router: Router) {}

  async handleRefresh(event: any): Promise<void> {
    try {
      await Promise.resolve();
    } finally {
      event.target.complete();
    }
  }

  onGoto() {
    this.router.navigate(['/classes']);   
  }
}
