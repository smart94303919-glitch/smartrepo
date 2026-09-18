import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sec-d',
  templateUrl: './sec-d.page.html',   // ✅ correct template file
  styleUrls: ['./sec-d.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class SecDPage {
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
