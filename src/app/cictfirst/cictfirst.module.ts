import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { CictfirstPageRoutingModule } from './cictfirst-routing.module';
import { CictfirstPage } from './cictfirst.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CictfirstPageRoutingModule,
    CictfirstPage   // ✅ import standalone component here
  ],
})
export class CictfirstPageModule {}
