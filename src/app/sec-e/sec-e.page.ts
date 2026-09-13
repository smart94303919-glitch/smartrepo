import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sec-e',
  templateUrl: './sec-e.page.html',   // ✅ correct template file
  styleUrls: ['./sec-e.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class SecEPage {
  constructor(private router: Router) {}

onGoto() {
    this.router.navigate(['/cictfirst']);
  }
}
