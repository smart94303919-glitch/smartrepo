import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SecBPage } from './sec-b.page';

const routes: Routes = [
  {
    path: '',
    component: SecBPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SecBPageRoutingModule {}
