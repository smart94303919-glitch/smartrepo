import { NgModule } from '@angular/core';
import { IonicModule } from '@ionic/angular';

import { SearchstudPageRoutingModule } from './searchstud-routing.module';
import { SearchstudPage } from './searchstud.page';

@NgModule({
  imports: [
    IonicModule,
    SearchstudPageRoutingModule,
    SearchstudPage // ✅ IMPORT standalone component here
  ]
})
export class SearchstudPageModule {}