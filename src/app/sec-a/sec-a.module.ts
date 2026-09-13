import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { SecAPageRoutingModule } from './sec-a-routing.module';
import { SecAPage } from './sec-a.page';  // ✅ standalone component

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SecAPageRoutingModule,
    SecAPage   // ✅ import standalone component here
  ],
})
export class SecAPageModule {}
