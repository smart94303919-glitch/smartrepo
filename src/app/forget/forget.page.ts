import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-forget',
  standalone: false,
  templateUrl: 'forget.page.html',
  styleUrls: ['forget.page.scss'],
})
export class ForgetPage {
  constructor(private router: Router) {}

  async handleRefresh(event: any): Promise<void> {
    try {
      await Promise.resolve();
    } finally {
      event.target.complete();
    }
  }

  onReset() {
    // Add password reset logic here
    this.router.navigate(['/login']);
  }

  onBack() {
    this.router.navigate(['/login']);
  }
}
