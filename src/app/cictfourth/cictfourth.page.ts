import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-cictfourth',
  templateUrl: './cictfourth.page.html',
  styleUrls: ['./cictfourth.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule]
})
export class CictfourthPage {
  constructor(private router: Router) {}

  onGoto() {
    this.router.navigate(['/cictp']);
  }

  onSectionA() {
    this.router.navigate(['/sec-a']);
  }

  onSectionB() {
    this.router.navigate(['/sec-b']);
  }

    onSectionC() {
    this.router.navigate(['/sec-c']);
  }

    onSectionD() {
    this.router.navigate(['/sec-d']);
  }

    onSectionE() {
    this.router.navigate(['/sec-e']);
  }
}
