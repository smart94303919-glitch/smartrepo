import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { CmbtpPageRoutingModule } from './cmbtp-routing.module';
import { CmbtpPage } from './cmbtp.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CmbtpPageRoutingModule,
    CmbtpPage   // ✅ import standalone component here
  ],
})
export class CmbtpPageModule {}
