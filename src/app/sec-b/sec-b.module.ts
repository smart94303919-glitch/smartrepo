import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SecBPageRoutingModule } from './sec-b-routing.module';

import { SecBPage } from './sec-b.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SecBPageRoutingModule,
    SecBPage
  ],
})
export class SecBPageModule {}
