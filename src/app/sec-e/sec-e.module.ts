import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SecEPageRoutingModule } from './sec-e-routing.module';

import { SecEPage } from './sec-e.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SecEPageRoutingModule,
    SecEPage
  ],
})
export class SecEPageModule {}
