import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { StudentregPageRoutingModule } from './studentreg-routing.module';
import { StudentregPage } from './studentreg.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    StudentregPageRoutingModule
  ],
  declarations: [StudentregPage],
})
export class StudentregPageModule {}
