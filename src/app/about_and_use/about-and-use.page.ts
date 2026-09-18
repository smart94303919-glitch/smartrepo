import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-about-and-use',
  templateUrl: './about-and-use.page.html',
  styleUrls: ['./about-and-use.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class AboutAndUsePage {
  constructor(private router: Router) {}

  async handleRefresh(event: any): Promise<void> {
    try {
      await Promise.resolve();
    } finally {
      event.target.complete();
    }
  }

  goBack() {
    this.router.navigate(['/morebtn']);
  }
}
