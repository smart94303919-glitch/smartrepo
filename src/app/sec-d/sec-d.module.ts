import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SecDPageRoutingModule } from './sec-d-routing.module';

import { SecDPage } from './sec-d.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SecDPageRoutingModule, 
    SecDPage
  ],
})
export class SecDPageModule {}
