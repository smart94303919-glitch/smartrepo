import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CictsecondPage } from './cictsecond.page';

const routes: Routes = [
  {
    path: '',
    component: CictsecondPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CictsecondPageRoutingModule {}
