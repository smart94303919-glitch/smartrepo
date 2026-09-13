import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { CictthirdPageRoutingModule } from './cictthird-routing.module'; // ✅ ADD THIS
import { CictthirdPage } from './cictthird.page';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    CictthirdPageRoutingModule, // ✅ THIS IS THE FIX
    CictthirdPage // standalone component
  ],
})
export class CictthirdPageModule {}