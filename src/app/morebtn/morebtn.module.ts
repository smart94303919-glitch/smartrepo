import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { MorebtnPageRoutingModule } from './morebtn-routing.module';
import { MorebtnPage } from './morebtn.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MorebtnPageRoutingModule,
    MorebtnPage   // ✅ import standalone component here
  ],
  // ❌ remove declarations
})
export class MorebtnPageModule {}
