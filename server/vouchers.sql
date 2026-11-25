SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SELECT Changed.ScopeChangedAt,R.RecId ReceiptId,RI.RecId ReceiptItemId,R.ReceiptType,R.ReceiptNo,
R.ReceiptDate,R.ReceiptTime,
CASE WHEN R.ReceiptDate IS NULL OR R.ReceiptTime IS NULL THEN NULL ELSE DATEADD(SECOND,DATEDIFF(SECOND,CONVERT(date,R.ReceiptTime),R.ReceiptTime),CONVERT(datetime,CONVERT(date,R.ReceiptDate))) END AS EventAt,R.InsertedAt HeaderInsertedAt,R.UpdatedAt HeaderUpdatedAt,RI.InsertedAt LineInsertedAt,RI.UpdatedAt LineUpdatedAt,
R.IsDeleted HeaderIsDeleted,R.IsCancelled HeaderIsCancelled,R.HasNegativeEffect HeaderHasNegativeEffect,
RI.IsDeleted LineIsDeleted,RI.IsCancelled LineIsCancelled,RI.HasNegativeEffect LineHasNegativeEffect,
RI.Quantity,RI.ReturnedQuantity,RI.ReturnReceiptItemId,RI.ReturnReceiptItemIdP,RI.TransferOutReceiptItemId,R.TransferInflowReceiptId,
I.RecId InventoryId,I.InventoryCode,I.StyleCardId,I.MainStyleCardId,I.StyleSampleRevisionNo InventoryRevision,
S.RecId SampleRecId,S.InventoryCode SampleCode,S.StyleSampleRevisionNo SampleRevision,
RI.InWarehouseId,WI.WarehouseCode InWarehouseCode,WI.WarehouseName InWarehouseName,WI.UD_NumuneDepo InWarehouseIsSampleDepot,WI.UD_NumuneMamul InWarehouseIsSampleGarment,
RI.OutWarehouseId,WO.WarehouseCode OutWarehouseCode,WO.WarehouseName OutWarehouseName,WO.UD_NumuneDepo OutWarehouseIsSampleDepot,WO.UD_NumuneMamul OutWarehouseIsSampleGarment,
ARR.ConfirmedTransferQuantity,ARR.ConfirmedTransferDate,ARR.ConfirmedTransferAt,ARR.ConfirmedTransferInsertedAt,
ARR.ConfirmedTransferHeaderId,ARR.ConfirmedTransferLineCount,
(SELECT COUNT_BIG(*) FROM dbo.MA_ProductivitySerialCard sc
 JOIN dbo.MA_WorkOrderItem wi ON wi.RecId=sc.WorkOrderItemId AND ISNULL(wi.IsDeleted,0)=0
 WHERE wi.InventoryId=S.RecId AND ISNULL(sc.IsDeleted,0)=0) AS TotalBarcodeCount,
'sample' AS LinkLevel
FROM #ChangedReceipt Changed
JOIN dbo.IM_ReceiptItem RI ON RI.RecId=Changed.LineId
JOIN dbo.IM_Receipt R ON R.RecId=RI.InventoryReceiptId
JOIN dbo.IM_Item I ON I.RecId=RI.InventoryId
JOIN dbo.IM_Item S ON S.RecId=CASE WHEN I.InventoryType=99 AND I.IsSample=1 THEN I.RecId ELSE I.StyleCardId END
JOIN #Samples SS ON SS.RecId=S.RecId
LEFT JOIN dbo.IM_Warehouse WI ON WI.RecId=RI.InWarehouseId
LEFT JOIN dbo.IM_Warehouse WO ON WO.RecId=RI.OutWarehouseId
OUTER APPLY(
 SELECT MAX(CASE WHEN TR.ReceiptDate IS NULL OR TR.ReceiptTime IS NULL THEN NULL ELSE DATEADD(SECOND,DATEDIFF(SECOND,CONVERT(date,TR.ReceiptTime),TR.ReceiptTime),CONVERT(datetime,CONVERT(date,TR.ReceiptDate))) END) AS ConfirmedTransferAt,
 SUM(TI.Quantity) ConfirmedTransferQuantity,MAX(TR.ReceiptDate) ConfirmedTransferDate,
 MAX(TI.InsertedAt) ConfirmedTransferInsertedAt,MAX(TR.RecId) ConfirmedTransferHeaderId,COUNT_BIG(*) ConfirmedTransferLineCount
 FROM dbo.IM_ReceiptItem TI JOIN dbo.IM_Receipt TR ON TR.RecId=TI.InventoryReceiptId
 WHERE R.ReceiptType=135 AND TR.ReceiptType=17 AND TR.RecId=R.TransferInflowReceiptId
 AND TI.TransferOutReceiptItemId=RI.RecId AND TI.InventoryId=RI.InventoryId
 AND ISNULL(TR.IsDeleted,0)=0 AND ISNULL(TR.IsCancelled,0)=0 AND ISNULL(TR.HasNegativeEffect,0)=0
 AND ISNULL(TI.IsDeleted,0)=0 AND ISNULL(TI.IsCancelled,0)=0 AND ISNULL(TI.HasNegativeEffect,0)=0 AND TI.Quantity>0
) ARR
WHERE R.ReceiptType IN(132,135) AND S.InventoryType=99 AND S.IsSample=1 AND ISNULL(I.IsDeleted,0)=0 AND ISNULL(S.IsDeleted,0)=0 OPTION (RECOMPILE);
