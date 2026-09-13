import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-cictp',
  templateUrl: './cictp.page.html',   // ✅ correct template file
  styleUrls: ['./cictp.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class CictpPage {
  constructor(private router: Router) {}

  onGoto() {
    this.router.navigate(['/classes']);
  }

  onGogo() {
    this.router.navigate(['/cictfirst']);
  }

  onGege() {
    this.router.navigate(['/cictsecond']);
  }

  onGigi() {
    this.router.navigate(['/cictthird']);
  }

  onGego() {
    this.router.navigate(['/cictfourth']);
  }

}
