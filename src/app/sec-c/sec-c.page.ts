import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sec-c',
  templateUrl: './sec-c.page.html',   // ✅ correct template file
  styleUrls: ['./sec-c.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class SecCPage {
  constructor(private router: Router) {}

  async handleRefresh(event: any): Promise<void> {
    try {
      await Promise.resolve();
    } finally {
      event.target.complete();
    }
  }

onGoto() {
    this.router.navigate(['/cictfirst']);
  }
}
