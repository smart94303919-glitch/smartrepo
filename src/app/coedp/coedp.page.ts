import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';   // ✅ import Router

@Component({
  selector: 'app-coedp',
  templateUrl: './coedp.page.html',
  styleUrls: ['./coedp.page.scss'],
  standalone: true,   // keep standalone
  imports: [CommonModule, IonicModule]  // ✅ import Ionic + Common
})
export class CoedpPage {
  constructor(private router: Router) {}
  onGoto() {
    this.router.navigate(['/classes']);   
  }
}
