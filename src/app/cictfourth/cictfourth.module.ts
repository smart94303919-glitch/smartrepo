import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { CictfourthPageRoutingModule } from './cictfourth-routing.module'; // ✅ ADD THIS
import { CictfourthPage } from './cictfourth.page';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    CictfourthPageRoutingModule, // ✅ THIS IS THE FIX
    CictfourthPage // standalone component
  ],
})
export class CictfourthPageModule {}