import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SecCPageRoutingModule } from './sec-c-routing.module';

import { SecCPage } from './sec-c.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SecCPageRoutingModule,
    SecCPage
  ],
})
export class SecCPageModule {}
