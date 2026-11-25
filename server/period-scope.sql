-- The source's audit datetimes are ERP local time. All business rows share one window.
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
DECLARE @until datetime2 = CONVERT(datetime2, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time');
-- Some ERP versions date attachments independently of the sample card.
CREATE TABLE #PhotoAudit (InventoryId bigint PRIMARY KEY, changedAt datetime2 NOT NULL);
DECLARE @photoDates nvarchar(200)='';
IF COL_LENGTH('dbo.IM_ItemAttachment','InsertedAt') IS NOT NULL SET @photoDates=N'(A.InsertedAt)';
IF COL_LENGTH('dbo.IM_ItemAttachment','UpdatedAt') IS NOT NULL SET @photoDates=CONCAT(NULLIF(@photoDates,'')+',',N'(A.UpdatedAt)');
IF COL_LENGTH('dbo.IM_ItemAttachment','DeletedAt') IS NOT NULL SET @photoDates=CONCAT(NULLIF(@photoDates,'')+',',N'(A.DeletedAt)');
IF LEN(@photoDates)>0
BEGIN
 DECLARE @photoQuery nvarchar(max)=N'INSERT INTO #PhotoAudit
 SELECT A.InventoryId,MAX(t.v) FROM dbo.IM_ItemAttachment A CROSS APPLY (VALUES '+@photoDates+N') t(v)
 WHERE A.InventoryId IS NOT NULL AND t.v>=@since AND t.v<=@until GROUP BY A.InventoryId';
 EXEC sys.sp_executesql @photoQuery,N'@since datetime2,@until datetime2',@since,@until;
END;
SELECT I.RecId, I.InventoryType, A.changedAt,P.changedAt AS photoChangedAt INTO #ChangedItem
FROM dbo.IM_Item I LEFT JOIN #PhotoAudit P ON P.InventoryId=I.RecId
CROSS APPLY (SELECT MAX(d.v) changedAt FROM (VALUES(I.InsertedAt),(I.UpdatedAt),(I.SampleStatusAt),(P.changedAt)) d(v)
             WHERE d.v >= @since AND d.v <= @until) A
WHERE (I.InventoryType=100 OR (I.InventoryType=99 AND I.IsSample=1))
  AND ISNULL(I.IsDeleted,0)=0 AND A.changedAt IS NOT NULL;

SELECT PT.RecId,PT.ProductivitySerialCardId INTO #ChangedMove
FROM dbo.MA_ProductivityTransactions PT
WHERE (PT.InsertedAt >= @since AND PT.InsertedAt <= @until)
   OR (PT.UpdatedAt >= @since AND PT.UpdatedAt <= @until)
   OR (PT.DeletedAt >= @since AND PT.DeletedAt <= @until);

-- Resolve the date and movement predicates before joining the work-order tables.
WITH CandidateSerials AS (
 SELECT RecId FROM dbo.MA_ProductivitySerialCard WHERE InsertedAt BETWEEN @since AND @until
 UNION
 SELECT RecId FROM dbo.MA_ProductivitySerialCard WHERE UpdatedAt BETWEEN @since AND @until
 UNION
 SELECT ProductivitySerialCardId FROM #ChangedMove
)
SELECT PSC.RecId, I.RecId SampleId INTO #ChangedSerial
FROM CandidateSerials C
JOIN dbo.MA_ProductivitySerialCard PSC ON PSC.RecId=C.RecId
JOIN dbo.MA_WorkOrderItem WI ON WI.RecId=PSC.WorkOrderItemId AND ISNULL(WI.IsDeleted,0)=0
JOIN dbo.MA_WorkOrder WO ON WO.RecId=PSC.WorkOrderId AND ISNULL(WO.IsDeleted,0)=0
JOIN dbo.IM_Item I ON I.RecId=WI.InventoryId AND I.InventoryType=99 AND I.IsSample=1 AND ISNULL(I.IsDeleted,0)=0
WHERE ISNULL(PSC.IsDeleted,0)=0;

-- A new type-17 arrival may confirm an older type-135 transfer.
SELECT CASE WHEN R.ReceiptType=17 THEN RI.TransferOutReceiptItemId ELSE RI.RecId END AS LineId,MAX(t.stamp) AS ScopeChangedAt
INTO #ChangedReceipt
FROM dbo.IM_Receipt R JOIN dbo.IM_ReceiptItem RI ON RI.InventoryReceiptId=R.RecId
CROSS APPLY (VALUES (R.InsertedAt),(R.UpdatedAt),(RI.InsertedAt),(RI.UpdatedAt),(R.DeletedAt),(RI.DeletedAt)) t(stamp)
WHERE R.ReceiptType IN (17,132,135) AND t.stamp>=@since AND t.stamp<=@until
GROUP BY CASE WHEN R.ReceiptType=17 THEN RI.TransferOutReceiptItemId ELSE RI.RecId END;

SELECT RecId INTO #Samples FROM #ChangedItem WHERE InventoryType=99
UNION SELECT SampleId FROM #ChangedSerial
UNION SELECT S.RecId
 FROM #ChangedReceipt C JOIN dbo.IM_ReceiptItem RI ON RI.RecId=C.LineId
 JOIN dbo.IM_Receipt R ON R.RecId=RI.InventoryReceiptId AND R.ReceiptType IN(132,135)
 JOIN dbo.IM_Item I ON I.RecId=RI.InventoryId AND ISNULL(I.IsDeleted,0)=0
 JOIN dbo.IM_Item S ON S.RecId=CASE WHEN I.InventoryType=99 AND I.IsSample=1 THEN I.RecId ELSE I.StyleCardId END
   AND S.InventoryType=99 AND S.IsSample=1 AND ISNULL(S.IsDeleted,0)=0;
