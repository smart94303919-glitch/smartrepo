import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sec-b',
  templateUrl: './sec-b.page.html',   // ✅ correct template file
  styleUrls: ['./sec-b.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class SecBPage {
  constructor(private router: Router) {}

onGoto() {
    this.router.navigate(['/cictfirst']);
  }
}
