import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CoedpPage } from './coedp.page';

const routes: Routes = [
  {
    path: '',
    component: CoedpPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CoedpPageRoutingModule {}
