import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { CictsecondPageRoutingModule } from './cictsecond-routing.module';
import { CictsecondPage } from './cictsecond.page';  // ✅ standalone component

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CictsecondPageRoutingModule,
    CictsecondPage   // ✅ import standalone component here
  ],
})
export class CictsecondPageModule {}
