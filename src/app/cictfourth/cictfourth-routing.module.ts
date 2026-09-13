import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CictfourthPage } from './cictfourth.page';

const routes: Routes = [
  {
    path: '',
    component: CictfourthPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CictfourthPageRoutingModule {}
