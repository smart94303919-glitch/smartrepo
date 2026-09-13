import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SecEPage } from './sec-e.page';

const routes: Routes = [
  {
    path: '',
    component: SecEPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SecEPageRoutingModule {}
