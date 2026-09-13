import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { CoedpPageRoutingModule } from './coedp-routing.module';
import { CoedpPage } from './coedp.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CoedpPageRoutingModule,
    CoedpPage   // ✅ import standalone component here
  ],
})
export class CoedpPageModule {}
