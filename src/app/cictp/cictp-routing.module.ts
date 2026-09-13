import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CictpPage } from './cictp.page';

const routes: Routes = [
  {
    path: '',
    component: CictpPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CictpPageRoutingModule {}
