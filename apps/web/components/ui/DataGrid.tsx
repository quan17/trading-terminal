"use client";

import { AllCommunityModule, ModuleRegistry, type ColDef, type RowClickedEvent } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";

ModuleRegistry.registerModules([AllCommunityModule]);

interface DataGridProps<T> {
  rows: T[];
  columns: ColDef<T>[];
  getRowId?: (row: T) => string;
  onRowClicked?: (row: T) => void;
}

export function DataGrid<T extends object>({ rows, columns, getRowId, onRowClicked }: DataGridProps<T>) {
  const optionalProps = {
    ...(getRowId ? { getRowId: (params: { data: T }) => getRowId(params.data) } : {}),
    ...(onRowClicked ? { onRowClicked: (event: RowClickedEvent<T>) => event.data && onRowClicked(event.data) } : {})
  };

  return (
    <div className="ag-theme-quartz-dark data-grid">
      <AgGridReact<T>
        rowData={rows}
        columnDefs={columns}
        rowHeight={30}
        headerHeight={32}
        suppressCellFocus
        suppressNoRowsOverlay
        animateRows
        theme="legacy"
        {...optionalProps}
      />
    </div>
  );
}
