import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SecDPage } from './sec-d.page';

const routes: Routes = [
  {
    path: '',
    component: SecDPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SecDPageRoutingModule {}
