import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SecCPage } from './sec-c.page';

const routes: Routes = [
  {
    path: '',
    component: SecCPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SecCPageRoutingModule {}
