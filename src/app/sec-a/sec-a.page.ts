import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sec-a',
  templateUrl: './sec-a.page.html',   // ✅ correct template file
  styleUrls: ['./sec-a.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class SecAPage {
  constructor(private router: Router) {}

onGoto() {
    this.router.navigate(['/cictfirst']);
  }
}
