import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { SectionsRoutingModule } from './sections-routing.module';
import { SectionsComponent } from './sections.component';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    SectionsRoutingModule,
    SectionsComponent
  ]
})
export class SectionsModule { }
