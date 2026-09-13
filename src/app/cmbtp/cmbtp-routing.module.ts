import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CmbtpPage } from './cmbtp.page';

const routes: Routes = [
  {
    path: '',
    component: CmbtpPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CmbtpPageRoutingModule {}
